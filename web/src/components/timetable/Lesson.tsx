import { type Component, createMemo, Show } from "solid-js";
import { textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";
import type { IClientLesson } from "~/types/client";
import { getLessonContentType } from "~/utils/lessons";
import { setLessonModalData } from "../modals/Lesson";

const Lesson: Component<{
	lesson: IClientLesson;
	column: number;
	totalColumns: number;
	durationLength: number;
}> = (props) => {
	const startTime = new Date(props.lesson.start_ts);
	const endTime = new Date(props.lesson.end_ts);

	// 8h00
	const displayStartTime = 8 * 60 * 60;
	// 19h30
	const displayEndTime = (19 * 60 + 30) * 60;

	const startTotalSeconds =
		(startTime.getHours() * 60 + startTime.getMinutes()) * 60 +
		startTime.getSeconds();
	const startPos =
		((startTotalSeconds - displayStartTime) /
			(displayEndTime - displayStartTime)) *
		100;

	const endTotalSeconds =
		(endTime.getHours() * 60 + endTime.getMinutes()) * 60 +
		endTime.getSeconds();
	const height =
		((endTotalSeconds - startTotalSeconds) /
			(displayEndTime - displayStartTime)) *
		100;

	const now_ts = () => now().toMillis();

	const isCurrentlyInLesson = createMemo(() => {
		const t = now_ts();
		return t < props.lesson.end_ts && t >= props.lesson.start_ts;
	});

	const isCancelled = () => props.lesson.content.is_cancelled;
	const lessonName = () =>
		props.lesson.content.lesson_name || getLessonContentType(props.lesson);
	const description = () => props.lesson.content.description;

	return (
		<div
			class="absolute"
			style={{
				top: `${startPos}%`,
				height: `${height}%`,
				left: `${(props.column / props.totalColumns) * 100}%`,
				width: `${(1 / props.totalColumns) * 100}%`,
			}}
		>
			<button
				type="button"
				class={[
					"focusable-lesson-for-swiper w-full h-full text-left flex border-t border-t-red select-none transition-colors cursor-pointer overflow-hidden",
					isCancelled()
						? "bg-red/25 border-l-4 border-l-red"
						: isCurrentlyInLesson()
							? "bg-[rgb(42,42,42)]"
							: "bg-[rgb(30,30,30)] hover:bg-[rgb(34,34,34)]",
				]}
				onClick={() => setLessonModalData(props.lesson)}
			>
				<div class="px-3 pt-2 flex-1 overflow-hidden">
					<div class="flex gap-1.5 pt-2px flex-shrink-0 flex-wrap items-center justify-right float-right max-w-[100%]">
						<Show when={isCancelled()}>
							<p class="text-[10px] border border-red text-red bg-red/20 rounded px-1 py-0.5 font-bold">
								ANNULÉ
							</p>
						</Show>
						<Show when={isCurrentlyInLesson() && !isCancelled()}>
							<div class="size-4px rd-full bg-red mr-4px animate-ping" />
						</Show>
						<Show when={props.lesson.content.room}>
							<p
								class={[
									"bg-red rounded-full font-medium px-3 h-fit truncate max-w-[min(100%,120px)]",
									props.durationLength > 1 ? "text-sm py-.5" : "text-xs py-0",
								]}
								style={{ color: textColorOnBG() }}
							>
								{props.lesson.content.room}
							</p>
						</Show>
					</div>
					<p
						class={[
							"text-[rgb(240,240,240)] text-left break-words font-medium",
							props.durationLength > 1 ? "text-sm" : "text-xs",
							isCancelled() && "line-through opacity-80",
						]}
					>
						<span class="text-red font-medium">{props.lesson.type}</span> :{" "}
						{lessonName()}
					</p>
					<Show when={description() && props.durationLength > 1}>
						<p class="text-xs text-[rgb(170,170,170)] text-left text-wrap">
							{description()}
						</p>
					</Show>
				</div>
			</button>
		</div>
	);
};
export default Lesson;
