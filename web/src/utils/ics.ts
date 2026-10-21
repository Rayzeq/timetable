import { createEvents } from "ics";
import type { IClientLesson } from "~/types/client";
import { getLessonDescription } from "./lessons";

/**
 * Exports every provided lesson to an ICS file. The caller is expected to pass
 * the whole timetable (`getAllLessons()`), not just the displayed week.
 */
export const generateICS = (lessons: IClientLesson[]): void => {
	if (lessons.length === 0) return;

	const { error, value } = createEvents(
		lessons.map((lesson) => {
			const start = new Date(lesson.start_date);
			const end = new Date(lesson.end_date);

			const content = getLessonDescription(lesson);
			const teacher =
				lesson.content.teacher && lesson.content.teacher !== "Inconnu"
					? lesson.content.teacher
					: undefined;

			return {
				title: `${lesson.type} - ${content}`,
				description: teacher ? `Avec ${teacher}.` : undefined,

				start: [
					start.getFullYear(),
					start.getMonth() + 1,
					start.getDate(),
					start.getHours(),
					start.getMinutes(),
				],
				end: [
					end.getFullYear(),
					end.getMonth() + 1,
					end.getDate(),
					end.getHours(),
					end.getMinutes(),
				],
				location: lesson.content.room,
			};
		}),
	);

	if (error || !value) {
		alert(
			"Une erreur s'est produite lors de la génération du fichier ICS, voir la console.",
		);
		console.error(error);
		return;
	}

	const date = new Date().toISOString().slice(0, 10);
	const filename = `emploi_du_temps_${date}.ics`;
	const file = new File([value], filename, { type: "text/calendar" });

	const url = URL.createObjectURL(file);

	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;

	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);

	URL.revokeObjectURL(url);
};
