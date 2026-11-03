// Addresses of the game's pages. Each page is a folder with an index.html (hunting.ltd/create-account/,
// hunting.ltd/hunting/, ...); the log-in page is the site's root. <body data-root> says how to get from this page
// to the root ("./" on the root page, "../" in a folder), so the same build works on hunting.ltd and anywhere else.
//   site('')               the log-in page (the site's front door)
//   site('create-account') the create-account page, and so on
export function site(page = '') {
  const root = new URL((document.body && document.body.dataset.root) || './', location.href);
  root.search = ''; root.hash = '';
  return new URL(page ? page + '/' : '', root).href;
}
