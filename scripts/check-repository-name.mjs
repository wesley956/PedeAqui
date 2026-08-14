const expected = "wesley956/PedeAqui";
const current = process.env.GITHUB_REPOSITORY;

if (!current) {
  console.log(`REPOSITORY_NAME: fora do GitHub Actions; esperado ${expected}.`);
  process.exit(0);
}

if (current !== expected) {
  console.error(`REPOSITORY_NAME: esperado ${expected}, recebido ${current}. Execute o rename do mesmo repository object antes de mesclar [321].`);
  process.exit(1);
}

console.log(`REPOSITORY_NAME: ${current} validado.`);
