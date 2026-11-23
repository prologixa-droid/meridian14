const test = require('node:test');
const assert = require('node:assert/strict');
const Tickets = require('../ticketing.js');

const base = (overrides = {}) => ({
  subject: 'Description mismatch on serum',
  type: 'Product text discrepancy',
  sku: 'SKU-C00003',
  priority: 'High',
  impact: 'Moderate',
  affectedProcess: 'Catalog metadata',
  assignedTo: 'Catalog QA',
  dueDate: '2026-12-10',
  evidenceRef: 'Supplier master revision 4',
  description: 'The product description conflicts with the supplier master wording.',
  expectedOutcome: 'Update the product copy and verify against the cited source.',
  catalogField: 'description',
  observedValue: 'Old catalog description value',
  proposedCorrection: 'Approved supplier description value',
  ...overrides,
});

const create = (overrides = {}) => Tickets.createTicket(base(overrides), {
  id: 'CAT-1001', now: '2026-11-16T09:00:00.000Z', by: 'trainee11',
});

test('creates a new ticket with the full audit fields and creation event', () => {
  const ticket = create();
  assert.equal(ticket.status, 'new');
  assert.equal(ticket.catalogField, 'description');
  assert.equal(ticket.observedValue, 'Old catalog description value');
  assert.equal(ticket.correctionApplied, false);
  assert.equal(ticket.activity.length, 1);
  assert.equal(ticket.activity[0].type, 'created');
});

test('requires meaningful details and field-level evidence for corrections', () => {
  assert.throws(() => create({ subject: 'short' }), /12 characters/);
  assert.throws(() => create({ evidenceRef: 'ref' }), /specific evidence/);
  assert.throws(() => create({ catalogField: '', evidenceRef: '' }), /specific evidence/);
  assert.throws(() => create({ proposedCorrection: '' }), /proposed correction/);
  assert.throws(() => create({ catalogField: 'unknown' }), /supported catalog field/);
  assert.throws(() => create({ sku: 'bad-sku' }), /valid linked product SKU/);
});

test('creates stable sequential ticket identifiers from mixed legacy IDs', () => {
  assert.equal(Tickets.nextId([{ id: 'CAT-19' }, { id: 'BUG-1104' }]), 'CAT-1105');
  assert.equal(Tickets.nextId([]), 'CAT-1001');
});

test('requires assignment before triage and work start', () => {
  const ticket = create({ assignedTo: 'Unassigned' });
  assert.throws(() => Tickets.transition(ticket, 'triaged'), /Assign an owner/);
  const triaged = Tickets.transition(create(), 'triaged', {}, { now: '2026-11-16T10:00:00Z' });
  const started = Tickets.transition(triaged, 'in_progress', {}, { now: '2026-11-16T10:05:00Z' });
  assert.equal(started.status, 'in_progress');
  assert.equal(ticket.status, 'new', 'transition leaves the original record unchanged');
});

test('block and resume steps require a traceable dependency note', () => {
  const working = Tickets.transition(Tickets.transition(create(), 'triaged'), 'in_progress');
  assert.throws(() => Tickets.transition(working, 'blocked', { note: 'waiting' }), /20 characters/);
  const blocked = Tickets.transition(working, 'blocked', { note: 'Waiting for approved supplier artwork revision.' });
  assert.equal(blocked.blockedReason, 'Waiting for approved supplier artwork revision.');
  assert.throws(() => Tickets.transition(blocked, 'in_progress', { note: 'done' }), /20 characters/);
  const resumed = Tickets.transition(blocked, 'in_progress', { note: 'Supplier sent the signed source artwork today.' });
  assert.equal(resumed.blockedReason, '');
  assert.match(resumed.comments[0].text, /Work resumed/);
});

test('field correction must be applied before submission to review', () => {
  const working = Tickets.transition(Tickets.transition(create(), 'triaged'), 'in_progress');
  const context = { resolutionSummary: 'Updated the field using the cited supplier master and rechecked the record.' };
  assert.throws(() => Tickets.transition(working, 'in_review', context), /Apply the linked catalog correction/);
  assert.throws(() => Tickets.transition({ ...working, correctionApplied: true }, 'in_review', { resolutionSummary: 'too short' }), /30 characters/);
  const submitted = Tickets.transition({ ...working, correctionApplied: true }, 'in_review', context);
  assert.equal(submitted.status, 'in_review');
});

test('review can approve or return with actionable notes; only approval closes', () => {
  const submitted = { ...create({ catalogField: '' }), status: 'in_review', resolutionSummary: 'Investigation complete with the source row attached.' };
  assert.throws(() => Tickets.transition(submitted, 'closed', { decision: 'approve', note: 'ok' }), /20 characters/);
  const closed = Tickets.transition(submitted, 'closed', { decision: 'approve', note: 'Verified the record against supplier master revision 4.' });
  assert.equal(closed.status, 'closed');
  assert.throws(() => Tickets.transition(submitted, 'in_progress', { decision: 'return', note: 'fix it' }), /20 characters/);
  const returned = Tickets.transition({ ...submitted, catalogField: 'description', correctionApplied: true }, 'in_progress', { decision: 'return', note: 'Please correct the unit and attach the revised source row.' });
  assert.equal(returned.status, 'in_progress');
  assert.equal(returned.resolutionSummary, '');
  assert.equal(returned.correctionApplied, false);
});

test('ticket filtering, overdue counts and summaries use the new lifecycle', () => {
  const list = [
    create({ dueDate: '2026-11-15' }),
    { ...create({ subject: 'Closed ticket for count check' }), status: 'closed', dueDate: '2026-11-01' },
    { ...create({ subject: 'Review ticket for count check' }), status: 'in_review', dueDate: '2026-11-15' },
  ];
  assert.equal(Tickets.filterTickets(list, 'active', '2026-11-16').length, 2);
  assert.equal(Tickets.filterTickets(list, 'overdue', '2026-11-16').length, 2);
  const counts = Tickets.summarize(list, '2026-11-16');
  assert.equal(counts.total, 3);
  assert.equal(counts.closed, 1);
  assert.equal(counts.inReview, 1);
  assert.equal(counts.overdue, 2);
});

test('cancellation is reasoned and terminal', () => {
  const ticket = create();
  assert.throws(() => Tickets.transition(ticket, 'cancelled', { note: 'no' }), /20 characters/);
  const cancelled = Tickets.transition(ticket, 'cancelled', { note: 'Duplicate report linked to CAT-9001.' });
  assert.equal(cancelled.status, 'cancelled');
  assert.throws(() => Tickets.transition(cancelled, 'in_progress'), /not allowed/);
});
