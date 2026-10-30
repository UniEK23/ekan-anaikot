/* Accessible mobile navigation */
const navToggle = document.getElementById("nav-toggle");
const nav = document.getElementById("primary-nav");

function setNavOpen(open) {
  if (!navToggle || !nav) return;
  nav.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
}

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  setNavOpen(!isOpen);
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setNavOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setNavOpen(false);
});
