// The page the "notify me" confirmation email links to (client/notify/): ?a=confirm or ?a=remove, and t = the code
// from the email. It only acts when the button is pressed, then shows what happened.
const SERVER = (import.meta.env.VITE_SERVER_URL || '').replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');
const $ = (id) => document.getElementById(id);
const p = new URLSearchParams(location.search);
const action = p.get('a') === 'remove' ? 'remove' : 'confirm';
const token = p.get('t') || '';
const TEXT = {
  confirm: {
    lead: 'Press the button to confirm your email for launch news.',
    button: 'Confirm my email',
    done: 'Thank you, your email is confirmed. We will email you when Hunting LTD goes live.',
  },
  remove: {
    lead: 'Press the button to take your email off the Hunting LTD launch list.',
    button: 'Remove my email',
    done: 'Your email has been removed. You won’t hear from us about the launch.',
  },
};
const form = $('f-notify'),
  button = $('l-go'),
  err = $('l-err'),
  done = $('l-done');

function finish(text) {
  // done (or the link is dead): drop the code from the address bar and history. Until then a reload still works.
  history.replaceState(null, '', location.pathname);
  form.hidden = true;
  $('l-lead').hidden = true;
  done.textContent = text;
  done.hidden = false;
  done.focus();
}
if (!/^[\w-]{43}$/.test(token)) {
  $('l-lead').textContent =
    'This link isn’t complete. Open it again from the email, or copy the whole link into your browser.';
} else {
  $('l-lead').textContent = TEXT[action].lead;
  button.textContent = TEXT[action].button;
  form.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  if (!SERVER) {
    err.textContent = 'This isn’t available right now. Please try again later.';
    return;
  }
  const label = button.textContent;
  button.disabled = true;
  button.textContent = button.dataset.busy;
  let status;
  try {
    const r = await fetch(`${SERVER}/notify/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined, // not in Safari before 16
    });
    status = r.status;
  } catch (e2) {
    status = 0;
  }
  button.disabled = false;
  button.textContent = label;
  if (status === 200) return finish(TEXT[action].done);
  if (status === 404 || status === 400)
    return finish(
      'This link doesn’t work any more. It may be from an older email, or the address was removed. You can sign up again on hunting.ltd.',
    );
  err.textContent =
    status === 429
      ? 'Too many tries from your connection. Please try again in an hour.'
      : 'Something went wrong. Please try again in a few minutes.';
});
