const sourceDate = new Intl.DateTimeFormat('en-PH', { timeZone:'Asia/Manila', year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
export function knowledgeDate(value, fallback = 'Not recorded') {
  if(!value)return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : sourceDate.format(date);
}
