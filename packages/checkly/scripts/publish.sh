npm run build

echo "//npm.pkg.github.com/:_authToken=${GITHUB_NPM_TOKEN}" > .npmrc
echo "@zuplo:registry=https://npm.pkg.github.com/" >> .npmrc

npm publish --no-workspaces || exit 1

rm .npmrc

echo "//registry.npmjs.org/:_authToken=${NPM_AUTH_TOKEN}" > .npmrc
echo "@zuplo:registry=https://registry.npmjs.org/" >> .npmrc

npm publish --access public --no-workspaces || exit 1

rm .npmrc
