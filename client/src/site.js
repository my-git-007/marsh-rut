// Addresses of the game's pages. Each page is a folder with an index.html (hunting.ltd/create-account/,
// hunting.ltd/hunting/, ...). <body data-root> says how to get from this page to the site's root ("./" on the root
// page, "../" in a folder), so the same build works on hunting.ltd and anywhere else.
//   site('')               the site's root: the "Coming early 2027" page while the game is in beta
//   site('sign-in')        the log-in page
//   site('create-account') the create-account page, and so on
export function site(page = '') {
  const root = new URL((document.body && document.body.dataset.root) || './', location.href);
  root.search = '';
  root.hash = '';
  return new URL(page ? page + '/' : '', root).href;
}
