import { createEvents } from "ics";
import type { IClientTimetable } from "~/types/client";
import { preferences, getUserYear } from "~/stores/preferences";
import { lessonsForSubGroup, getLessonDescription, getLessonContentType } from "./lessons";
import { shortToFullTeacherName } from "./teachers";

export const generateICS = (timetable: Pick<IClientTimetable, "header" | "lessons">): void => {
  const lessons = lessonsForSubGroup(timetable, {
    main_group: preferences.main_group,
    sub_group: preferences.sub_group
  });

  const { error, value } = createEvents(lessons.map(lesson => {
    const start = new Date(lesson.start_date);
    const end = new Date(lesson.end_date);

    const content = getLessonDescription(lesson);

    return {
      title: lesson.type + " - " + getLessonContentType(lesson) + " - " + content,
      description: `
${content}
Avec ${shortToFullTeacherName(lesson.content.teacher)?.name ?? lesson.content.teacher} en salle ${lesson.content.room}.
      `.trim(),

      start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
      end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
      location: lesson.content.room
    };
  }));

  if (error || !value) {
    alert("Une erreur s'est produit lors de la génération du fichier ICS, voir la console.");
    console.error(error);
    return;
  }

  const filename = "A" + getUserYear().toString() + "_G" + preferences.main_group.toString() + (preferences.sub_group === 0 ? "A" : "B") + "_S" + timetable.header.week_number + ".ics";
  const file = new File([value], filename, { type: "text/calendar" });

  const url = URL.createObjectURL(file);

  // trying to assign the file URL to a window could cause cross-site
  // issues so this is a workaround using HTML5
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
};
