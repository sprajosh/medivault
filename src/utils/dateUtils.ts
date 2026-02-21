export function formatDate(date: unknown): string {
  if (!date) return "";
  
  let d: Date;
  
  if (date instanceof Date) {
    d = date;
  } else if (date && typeof date === "object" && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function") {
    d = (date as { toDate: () => Date }).toDate();
  } else {
    d = new Date(date as string);
  }
  
  if (isNaN(d.getTime())) return "";
  
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
