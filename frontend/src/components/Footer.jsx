export default function Footer() {
  return (
    <footer
      className="hidden md:block py-4 px-6 text-center text-xs"
      style={{ color: "var(--n-dim)", borderTop: "1px solid var(--n-border)" }}
    >
      <span>&copy; {new Date().getFullYear()} CK</span>
    </footer>
  );
}
