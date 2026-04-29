/*
  File: public/theme.js
  Project: 843Teez Orders
  Purpose: Shared dark mode toggle for non-board pages
*/

const THEME_STORAGE_KEY = "843teez-orders-theme";
const themeToggleBtn = document.getElementById("theme-toggle-btn");

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark-mode", isDark);

  if (themeToggleBtn) {
    themeToggleBtn.textContent = isDark ? "Light Mode" : "Dark Mode";
    themeToggleBtn.setAttribute("aria-pressed", String(isDark));
    themeToggleBtn.setAttribute(
      "title",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
  }
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === "dark" ? "dark" : "light");
}

themeToggleBtn?.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark-mode")
    ? "light"
    : "dark";

  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
});

loadSavedTheme();
