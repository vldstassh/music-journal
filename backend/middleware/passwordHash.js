import bcrypt from "bcrypt";

export async function hashPassword(userPassword) {
	return bcrypt.hash(userPassword, 12);
}

export async function comparePasswordToHash(userPassword, hash) {
	return bcrypt.compare(userPassword, hash);
}
