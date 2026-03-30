/**
 * Check if a response has unclosed bracket blocks that need more content.
 * Returns true if the response looks incomplete.
 */
export function hasIncompleteBlock(text: string): boolean {
  // Check for [write] without [/write]
  const writeOpens = (text.match(/\[write\]/gi) || []).length;
  const writeCloses = (text.match(/\[\/write\]/gi) || []).length;
  if (writeOpens > writeCloses) return true;

  // Check for [edit] without [/edit] or without complete [old]...[/old] [new]...[/new]
  const editOpens = (text.match(/\[edit\]/gi) || []).length;
  const oldCloses = (text.match(/\[\/old\]/gi) || []).length;
  const newCloses = (text.match(/\[\/new\]/gi) || []).length;
  if (editOpens > 0 && (oldCloses < editOpens || newCloses < editOpens)) return true;

  // Check for [old] without [/old]
  const oldOpens = (text.match(/\[old\]/gi) || []).length;
  if (oldOpens > oldCloses) return true;

  // Check for [new] without [/new]
  const newOpens = (text.match(/\[new\]/gi) || []).length;
  if (newOpens > newCloses) return true;

  return false;
}
