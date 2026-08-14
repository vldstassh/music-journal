async function getAllMoods() {}

async function displayMoods(moods) {
	const moods = await getAllMoods();
	console.log("Moods for current user:", moods);
}

displayMoods();
