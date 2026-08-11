// Stamps the current year into the footer. Kept out of the HTML so the
// Content-Security-Policy in _headers can forbid inline scripts entirely.
const el = document.getElementById("year");
if (el) el.textContent = new Date().getFullYear();
