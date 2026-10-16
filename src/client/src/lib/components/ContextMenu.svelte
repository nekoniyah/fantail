<script lang="ts" module>
    export interface MenuItem {
        label: string;
        value?: unknown;
        disabled?: boolean;
    }
</script>

<script lang="ts">
    import {tick, type Snippet} from 'svelte';

    interface Props {
        items: MenuItem[];
        onselect?: (item: MenuItem) => void;
        children?: Snippet;
    }

    let {items, onselect, children, ...rest}: Props = $props();

    let open = $state(false);
    let positioned = $state(false); // menu stays invisible until it has its final position
    let x = $state(0);
    let y = $state(0);
    let menuEl: HTMLUListElement | undefined = $state();

    const ENABLED_ITEM = '[role="menuitem"]:not([aria-disabled="true"])';

    async function show(e: MouseEvent): Promise<void> {
        if (e.shiftKey) return; // Shift + right-click keeps the native menu
        e.preventDefault();

        positioned = false;
        x = e.clientX;
        y = e.clientY;
        open = true;

        await tick(); // render (invisible) so we can measure it
        if (!menuEl) return;

        // Keep the menu inside the viewport
        x = Math.max(4, Math.min(x, window.innerWidth - menuEl.offsetWidth - 4));
        y = Math.max(4, Math.min(y, window.innerHeight - menuEl.offsetHeight - 4));

        await tick(); // apply the final position before revealing
        positioned = true;

        // Focus the menu itself (no item highlighted) so arrow keys / Escape work
        menuEl?.focus({preventScroll: true});
    }

    function close(): void {
        open = false;
        positioned = false;
    }

    function choose(item: MenuItem): void {
        if (item.disabled) return;
        onselect?.(item);
        close();
    }

    function onMenuKey(e: KeyboardEvent): void {
        if (!menuEl) return;
        const els = [...menuEl.querySelectorAll<HTMLElement>(ENABLED_ITEM)];
        if (!els.length) return;
        const i = els.indexOf(document.activeElement as HTMLElement);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            els[i < 0 ? 0 : (i + 1) % els.length]?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            els[i < 0 ? els.length - 1 : (i - 1 + els.length) % els.length]?.focus();
        } else if (e.key === 'Escape') {
            close();
        }
    }

    function onItemKey(e: KeyboardEvent, item: MenuItem): void {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose(item);
        }
    }

    // Global dismissal listeners, only while the menu is open.
    // Attached on the next tick so the event that opened the menu can't close it.
    $effect(() => {
        if (!open) return;

        const onOutside = (e: Event) => {
            if (!menuEl?.contains(e.target as Node)) close();
        };
        const onScroll = (e: Event) => {
            if (!menuEl?.contains(e.target as Node)) close();
        };

        const timer = setTimeout(() => {
            document.addEventListener('pointerdown', onOutside, true);
            document.addEventListener('contextmenu', onOutside, true);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', close);
            window.addEventListener('blur', close);
        }, 0);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('pointerdown', onOutside, true);
            document.removeEventListener('contextmenu', onOutside, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('blur', close);
        };
    });
</script>

<div oncontextmenu={show} {...rest}>
    {@render children?.()}
</div>

{#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul
            bind:this={menuEl}
            role="menu"
            tabindex="-1"
            style="left:{x}px; top:{y}px"
            onkeydown={onMenuKey}
            class:invisible={!positioned}
            class="fixed z-1000 m-0 min-w-36 list-none rounded-md border border-gray-300 bg-white py-1 text-gray-900 shadow-lg outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
    >
        {#each items as item}
            <li
                    role="menuitem"
                    tabindex="-1"
                    aria-disabled={item.disabled ? 'true' : undefined}
                    onclick={() => choose(item)}
                    onkeydown={(e) => onItemKey(e, item)}
                    class="cursor-pointer select-none px-3.5 py-1.5 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent dark:hover:bg-gray-700 dark:focus:bg-gray-700 dark:aria-disabled:hover:bg-transparent"
            >
                {item.label}
            </li>
        {/each}
    </ul>
{/if}