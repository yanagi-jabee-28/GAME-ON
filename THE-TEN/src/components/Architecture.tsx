import {
	CodeXmlIcon,
	CpuIcon,
	GamepadIcon,
	type LucideIcon,
} from "lucide-solid";
import { type Component, createSignal, type JSX } from "solid-js";
import { cn } from "../utils";

const TechItem: Component<{
	category: string;
	name: string | JSX.Element;
	colorClass: string;
}> = (props) => {
	return (
		<div class="grid place-items-center gap-0.5 w-20">
			<div class="font-medium text-xs text-neutral-400">{props.category}</div>
			<div class={cn("size-10 rounded-full", props.colorClass)} />
			<div>{props.name}</div>
		</div>
	);
};

const ConnectorDown = () => {
	return (
		<div
			class={cn(
				"bg-neutral-200 h-5 relative",
				"after:h-3 after:w-6 after:bg-white after:rounded-t-full",
				"after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2",
			)}
		/>
	);
};

const ConnectorUp = () => {
	return (
		<div
			class={cn(
				"bg-neutral-200 h-1.5 relative mt-3",
				"after:h-3 after:w-6 after:bg-inherit after:rounded-t-full",
				"after:absolute after:top-0 after:left-1/2 after:-translate-x-1/2 after:-translate-y-full",
			)}
		/>
	);
};

const SectionHeader: Component<{
	icon: LucideIcon;
	title: string | JSX.Element;
}> = (props) => {
	return (
		<header
			class={cn(
				"grid grid-cols-[auto_1fr] gap-3 items-center",
				"px-3 pt-2 pb-1.5",
				"text-sm font-medium",
			)}
		>
			<props.icon size={18} class="text-neutral-400" aria-hidden="true" />
			<h3>{props.title}</h3>
		</header>
	);
};

const GameLogic = (props: {
	class?: string;
	ref?: HTMLDivElement;
	style?: JSX.CSSProperties;
}) => {
	return (
		<div
			ref={props.ref}
			class={cn("animate-game-logic-slide-in", props.class)}
			style={props.style}
		>
			<div class="border-2 border-neutral-200 border-b-0 rounded-t-lg bg-white">
				<SectionHeader icon={GamepadIcon} title="Game Logic" />

				<div class="flex gap-6 border-t-2 border-neutral-200 px-6 py-3">
					<TechItem category="game" name="The 10" colorClass="bg-zinc-500" />
					<TechItem category="game" name="Slot" colorClass="bg-zinc-400" />
					<TechItem
						category="game switcher"
						name="Switcher"
						colorClass="bg-zinc-300"
					/>
				</div>
			</div>

			<ConnectorDown />
		</div>
	);
};

const RaspberryPi = (props: {
	class?: string;
	ref?: HTMLDivElement;
	style?: JSX.CSSProperties;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}) => {
	return (
		<div
			ref={props.ref}
			class={cn(props.class)}
			style={props.style}
			onMouseEnter={props.onMouseEnter}
			onMouseLeave={props.onMouseLeave}
		>
			<ConnectorUp />
			<div class="border-2 border-neutral-200 border-t-0 rounded-b-lg bg-white">
				<SectionHeader
					icon={CpuIcon}
					title={
						<>
							Raspberry Pi Pico <span class="text-neutral-400">Adapter</span>
						</>
					}
				/>

				<div class="flex gap-6 border-t-2 border-neutral-200 px-6 py-3">
					<TechItem
						category="js runtime"
						name="Kaluma"
						colorClass="bg-lime-500"
					/>
					<TechItem
						category="builder"
						name="esbuild"
						colorClass="bg-yellow-300"
					/>
					<TechItem category="ui" name="Hardware" colorClass="bg-red-500" />
				</div>
			</div>
		</div>
	);
};

const Browser = (props: {
	class?: string;
	ref?: HTMLDivElement;
	style?: JSX.CSSProperties;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}) => {
	return (
		<div
			ref={props.ref}
			class={cn(props.class)}
			style={props.style}
			onMouseEnter={props.onMouseEnter}
			onMouseLeave={props.onMouseLeave}
		>
			<ConnectorUp />
			<div class="border-2 border-neutral-200 border-t-0 rounded-b-lg bg-white">
				<SectionHeader
					icon={CodeXmlIcon}
					title={
						<>
							Browser <span class="text-neutral-400">Adapter</span>
						</>
					}
				/>

				<div class="flex gap-6 border-t-2 border-neutral-200 px-6 py-3">
					<TechItem category="builder" name="Vite" colorClass="bg-violet-400" />
					<TechItem category="ui" name="SolidJS" colorClass="bg-blue-300" />
					<TechItem
						category="styling"
						name="Tailwind"
						colorClass="bg-sky-300"
					/>
				</div>
			</div>
		</div>
	);
};

export const Architecture = () => {
	let containerRef: HTMLDivElement | undefined;
	let raspberryRef: HTMLDivElement | undefined;
	let browserRef: HTMLDivElement | undefined;
	const [logicTranslateX, setLogicTranslateX] = createSignal(0);
	const [raspberryTranslateY, setRaspberryTranslateY] = createSignal(0);
	const [browserTranslateY, setBrowserTranslateY] = createSignal(0);

	// ホバー状態（アニメーション遅延の切り替えに使用）
	const [isHovering, setIsHovering] = createSignal(false);

	const calculateOffset = (targetRef: HTMLDivElement, isRaspberry: boolean) => {
		if (!containerRef || !targetRef) return;

		const containerRect = containerRef.getBoundingClientRect();
		const targetRect = targetRef.getBoundingClientRect();

		// 水平方向の移動量（ロジック用）
		const containerCenter = containerRect.left + containerRect.width / 2;
		const targetCenter = targetRect.left + targetRect.width / 2;
		const offsetX = targetCenter - containerCenter;

		setLogicTranslateX(offsetX);

		// 垂直方向の移動量（アダプター用）
		// gap(gap-8 = 32px) + でっぱりの高さ(h-3 = 12px) = 44px
		const moveUpDistance = -44; // 適宜調整

		if (isRaspberry) {
			setRaspberryTranslateY(moveUpDistance);
			setBrowserTranslateY(0);
		} else {
			setBrowserTranslateY(moveUpDistance);
			setRaspberryTranslateY(0);
		}

		setIsHovering(true);
	};

	const resetOffset = () => {
		setLogicTranslateX(0);
		setRaspberryTranslateY(0);
		setBrowserTranslateY(0);
		setIsHovering(false);
	};

	return (
		<div
			ref={containerRef}
			class="grid gap-8 justify-items-center"
		>
			<GameLogic
				class={cn(
					"transition-transform duration-200",
					// ホバー終了時のみ遅延
					!isHovering() && "delay-200",
				)}
				style={{ transform: `translateX(${logicTranslateX()}px)` }}
			/>
			<div class="flex justify-center gap-4">
				<RaspberryPi
					ref={raspberryRef}
					class={cn(
						"transition-transform duration-200",
						// ホバー開始時のみ遅延
						isHovering() && "delay-200",
					)}
					style={{ transform: `translateY(${raspberryTranslateY()}px)` }}
					onMouseEnter={() =>
						raspberryRef && calculateOffset(raspberryRef, true)
					}
					onMouseLeave={resetOffset}
				/>
				<Browser
					ref={browserRef}
					class={cn(
						"transition-transform duration-200",
						// ホバー開始時のみ遅延
						isHovering() && "delay-200",
					)}
					style={{ transform: `translateY(${browserTranslateY()}px)` }}
					onMouseEnter={() => browserRef && calculateOffset(browserRef, false)}
					onMouseLeave={resetOffset}
				/>
			</div>
		</div>
	);
};
