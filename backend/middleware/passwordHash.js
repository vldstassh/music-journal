import bcrypt from "bcrypt";

export async function hashPassword(userPassword) {
	const salt = bcrypt.genSaltSync(10);
	const hash = await bcrypt.hash(userPassword, salt);
	return hash;
}

export async function comparePasswordToHash(userPassword, hash) {
	const isMatch = await bcrypt.compare(userPassword, hash);
	return isMatch;
}
