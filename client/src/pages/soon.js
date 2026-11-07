// The "Coming early 2027" front page (client/index.html): sends the email to the server's /notify list
// (server/notify.js), then swaps the form for a thank-you line. A reload shows the form again, so someone who
// mistyped their address or lost the confirmation email can sign up again.
const SERVER = (import.meta.env.VITE_SERVER_URL || '').replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const $ = (id) => document.getElementById(id);
const form = $('f-notify'),
  input = $('n-email'),
  err = $('n-email-err'),
  button = form.querySelector('button'),
  thanks = $('n-thanks');

function showThanks(focus) {
  form.hidden = true;
  thanks.hidden = false;
  if (focus) thanks.focus();
}
function problem(text) {
  err.textContent = text;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}
try {
  localStorage.removeItem('hl-notify'); // an older version of this page kept the thank-you line after a reload
} catch (e) {}

input.addEventListener('input', () => {
  if (err.textContent) {
    err.textContent = '';
    input.removeAttribute('aria-invalid');
  }
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = input.value.trim();
  if (!email) return problem('Enter your email address.');
  if (email.length > 254 || !EMAIL_RE.test(email)) return problem('Enter an email like name@example.com.');
  if (!SERVER) return problem('Signing up isn’t available right now. Please try again later.');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = button.dataset.busy;
  let status;
  try {
    const r = await fetch(SERVER + '/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined, // not in Safari before 16
    });
    status = r.status;
  } catch (e2) {
    status = 0;
  }
  button.disabled = false;
  button.textContent = label;
  if (status === 200) return showThanks(true);
  if (status === 400) return problem('Enter an email like name@example.com.');
  if (status === 429) return problem('Too many tries from your connection. Please try again in an hour.');
  problem('We couldn’t add your email just now. Please try again in a few minutes.');
});
