/* Pure ticket rules shared by the browser UI and node:test suite. */
(function exposeTicketing(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.MeridianTicketing=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 const STATUSES=Object.freeze(['new','triaged','in_progress','blocked','in_review','closed','cancelled']);
 const ACTIVE_STATUSES=Object.freeze(['new','triaged','in_progress','blocked','in_review']);
 const LABELS=Object.freeze({new:'New',triaged:'Triaged',in_progress:'In progress',blocked:'Blocked',in_review:'In review',closed:'Closed',cancelled:'Cancelled'});
 const CATALOG_FIELDS=Object.freeze(['name','description','ingredients','suitability','claims','directions','netContent']);
 const text=value=>String(value??'').trim();
 function validateDraft(draft){
  const errors=[];
  if(text(draft.subject).length<12)errors.push('Summary must contain at least 12 characters.');
  if(text(draft.description).length<40)errors.push('Issue details must contain at least 40 characters.');
  if(text(draft.expectedOutcome).length<20)errors.push('Acceptance outcome must contain at least 20 characters.');
  if(!/^SKU-C\d{5}$/.test(text(draft.sku)))errors.push('Choose a valid linked product SKU.');
  if(text(draft.evidenceRef).length<8)errors.push('Add a specific evidence reference.');
  if(draft.catalogField){
   if(!CATALOG_FIELDS.includes(draft.catalogField))errors.push('Choose a supported catalog field.');
   if(text(draft.observedValue).length<5)errors.push('Capture the observed field value.');
   if(text(draft.proposedCorrection).length<5)errors.push('Enter a proposed correction.');
  }
  if(draft.dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate))errors.push('Due date must use YYYY-MM-DD.');
  return errors;
 }
 function createTicket(draft,{id,now=new Date().toISOString(),by='trainee11'}={}){
  const errors=validateDraft(draft);if(errors.length)throw new Error(errors.join(' '));
  const ticket={id,subject:text(draft.subject),type:text(draft.type)||'Catalog issue',sku:text(draft.sku),priority:text(draft.priority)||'Normal',impact:text(draft.impact)||'Moderate',affectedProcess:text(draft.affectedProcess)||'Catalog metadata',evidenceRef:text(draft.evidenceRef),assignedTo:text(draft.assignedTo)||'Unassigned',status:'new',dueDate:text(draft.dueDate),description:text(draft.description),expectedOutcome:text(draft.expectedOutcome),catalogField:draft.catalogField||'',observedValue:text(draft.observedValue),proposedCorrection:text(draft.proposedCorrection),correctionApplied:false,createdAt:now,createdBy:by,resolutionSummary:'',blockedReason:'',reviewNote:'',comments:[],activity:[]};
  ticket.activity.push({type:'created',by,at:now,message:`Ticket created by ${by}`});return ticket;
 }
 function nextId(tickets){const max=(tickets||[]).reduce((n,t)=>Math.max(n,Number(String(t.id||'').replace(/\D/g,''))||1000),1000);return `CAT-${max+1}`;}
 function transition(ticket,next,context={},meta={}){
  if(!STATUSES.includes(next))throw new Error(`Unknown ticket status: ${next}`);
  const from=ticket.status||'new',{now=new Date().toISOString(),by='trainee11'}=meta;
  const out={...ticket,activity:[...(ticket.activity||[])],comments:[...(ticket.comments||[])]};
  const note=text(context.note),assigned=text(out.assignedTo);
  if(from==='new'&&next==='triaged'){
   if(!assigned||assigned==='Unassigned')throw new Error('Assign an owner before completing triage.');
   out.triagedAt=now;
  }else if(from==='triaged'&&next==='in_progress'){
   if(!assigned||assigned==='Unassigned')throw new Error('An assigned owner is required to start work.');
   out.startedAt=now;
  }else if(from==='in_progress'&&next==='blocked'){
   if(note.length<20)throw new Error('Record a blocker and the next dependency in at least 20 characters.');
   out.blockedReason=note;out.blockedAt=now;
  }else if(from==='blocked'&&next==='in_progress'){
   if(note.length<20)throw new Error('Record what changed before resuming in at least 20 characters.');
   out.comments.push({by,at:now,text:`Work resumed: ${note}`});out.blockedReason='';out.resumedAt=now;
  }else if(from==='in_progress'&&next==='in_review'){
   if(text(context.resolutionSummary).length<30)throw new Error('Resolution summary must contain at least 30 characters.');
   if(out.catalogField&&!out.correctionApplied)throw new Error('Apply the linked catalog correction before review.');
   out.resolutionSummary=text(context.resolutionSummary);out.resolvedAt=now;
  }else if(from==='in_review'&&next==='closed'){
   if(context.decision!=='approve')throw new Error('Reviewer approval is required to close this ticket.');
   if(note.length<20)throw new Error('Reviewer verification note must contain at least 20 characters.');
   out.reviewNote=note;out.reviewedAt=now;out.closedAt=now;
  }else if(from==='in_review'&&next==='in_progress'){
   if(context.decision!=='return')throw new Error('Choose return for changes to resume work.');
   if(note.length<20)throw new Error('Give the owner actionable review feedback of at least 20 characters.');
   out.reviewNote=note;out.resolutionSummary='';if(out.catalogField)out.correctionApplied=false;out.reviewedAt=now;
  }else if(from==='closed'&&next==='in_progress'){
   if(note.length<20)throw new Error('Provide a reason for reopening of at least 20 characters.');
   if(out.catalogField)out.correctionApplied=false;
   out.comments.push({by,at:now,text:`Reopened: ${note}`});out.resolutionSummary='';out.closedAt=null;
  }else if((from==='new'||from==='triaged')&&next==='cancelled'){
   if(note.length<20)throw new Error('Provide a cancellation reason of at least 20 characters.');
   out.cancelReason=note;out.cancelledAt=now;
  }else throw new Error(`Transition from ${LABELS[from]||from} to ${LABELS[next]} is not allowed.`);
  out.status=next;out.updatedAt=now;out.activity.push({type:'status',from,to:next,by,at:now,message:`${LABELS[from]||from} -> ${LABELS[next]}`});return out;
 }
 function isActive(ticket){return ACTIVE_STATUSES.includes(ticket.status);}
 function isOverdue(ticket,today){return Boolean(ticket.dueDate&&ticket.dueDate<today&&isActive(ticket));}
 function filterTickets(tickets,filter,today){return (tickets||[]).filter(t=>filter==='active'?isActive(t):filter==='overdue'?isOverdue(t,today):t.status===filter);}
 function summarize(tickets,today){const list=tickets||[];return {total:list.length,active:list.filter(isActive).length,new:list.filter(t=>t.status==='new').length,triaged:list.filter(t=>t.status==='triaged').length,inProgress:list.filter(t=>t.status==='in_progress').length,blocked:list.filter(t=>t.status==='blocked').length,inReview:list.filter(t=>t.status==='in_review').length,closed:list.filter(t=>t.status==='closed').length,cancelled:list.filter(t=>t.status==='cancelled').length,urgent:list.filter(t=>['Urgent','High'].includes(t.priority)).length,overdue:list.filter(t=>isOverdue(t,today)).length};}
 return Object.freeze({STATUSES,ACTIVE_STATUSES,LABELS,CATALOG_FIELDS,validateDraft,createTicket,nextId,transition,isActive,isOverdue,filterTickets,summarize});
});
