#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use --silent 24 || exit 1
fi
if ! node -e 'if(Number(process.versions.node.split(".")[0]) < 24) process.exit(1)' 2>/dev/null; then
  print 'Rehearsal needs Node.js 24. Install it, then open this launcher again.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
print 'Open http://localhost:3040 once the app says Ready. Ctrl+C stops this lab.'
npm run dev
