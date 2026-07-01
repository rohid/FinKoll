import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: tsx src/scripts/setup-admin.ts <password>");
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log("\nAdd this to your .env file:");
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
});
