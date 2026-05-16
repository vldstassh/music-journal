export function isAuth(req, res, next) {
	if (req.session.userId) {
		next();
	} else {
		res.sendStatus(401);
	}
}
