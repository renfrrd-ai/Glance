/*
 * The app areas the control center frames: /learn, /boards, /recordings and the
 * rest. Each one is a page in its own right — opened directly by a link, or
 * inside the control center's rail — so this layout deliberately adds no
 * chrome of its own.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
