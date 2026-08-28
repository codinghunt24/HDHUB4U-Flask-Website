import { useEffect, useRef } from "react";

type AdsterraSlotProps = {
  code: string | null | undefined;
  placement: "top" | "content" | "sidebar" | "footer";
};

const placementLabels: Record<AdsterraSlotProps["placement"], string> = {
  top: "Top advertisement",
  content: "Content advertisement",
  sidebar: "Sidebar advertisement",
  footer: "Footer advertisement",
};

/**
 * Adsterra snippets contain scripts, so dangerouslySetInnerHTML is not enough:
 * browsers do not execute scripts inserted that way. This component only
 * receives the dedicated, admin-controlled ad fields from public settings.
 */
export function AdsterraSlot({ code, placement }: AdsterraSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const label = placementLabels[placement];

  useEffect(() => {
    const container = containerRef.current;
    const snippet = code?.trim();
    if (!container || !snippet) return;

    container.replaceChildren();
    const fragment = document
      .createRange()
      .createContextualFragment(snippet);

    for (const sourceScript of Array.from(fragment.querySelectorAll("script"))) {
      const executableScript = document.createElement("script");
      for (const attribute of Array.from(sourceScript.attributes)) {
        executableScript.setAttribute(attribute.name, attribute.value);
      }
      executableScript.text = sourceScript.textContent ?? "";
      sourceScript.replaceWith(executableScript);
    }

    container.appendChild(fragment);

    return () => {
      container.replaceChildren();
    };
  }, [code]);

  if (!code?.trim()) return null;

  return (
    <div
      ref={containerRef}
      aria-label={label}
      data-ad-placement={placement}
      className="adsterra-slot flex min-h-0 w-full items-center justify-center overflow-hidden [&_iframe]:max-w-full"
    />
  );
}