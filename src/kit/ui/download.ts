/** Save text as a file where the browser allows it, and fall back to the clipboard. */
export async function saveText(name: string, text: string, mime = "application/json"): Promise<"download" | "clipboard" | "none"> {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "download";
  } catch {
    /* fall through */
  }
  return (await copyText(text)) ? "clipboard" : "none";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
