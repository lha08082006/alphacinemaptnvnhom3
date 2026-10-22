const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(indexPath, 'utf-8');

s = s.replace("const SPA_VIEWS = ['home'", "const SPA_VIEWS = ['account', 'thong-tin-tai-khoan', 'home'");

if (!s.includes('js/account.js')) {
  s = s.replace('<script src="js/auth-modal.js"></script>', '<script src="js/auth-modal.js"></script>\n    <script src="js/account.js"></script>');
}

fs.writeFileSync(indexPath, s, 'utf-8');
console.log('Successfully patched SPA_VIEWS and account.js script tag');
