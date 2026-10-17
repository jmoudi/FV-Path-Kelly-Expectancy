export function Help({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="help">
      <button type="button" className="help-btn" aria-label="What is this?">
        ?
      </button>
      <span role="tooltip" className="tip">
        {text}
      </span>
    </span>
  );
}
