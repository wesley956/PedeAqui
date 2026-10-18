/** Numa linha de abas que rola para o lado, deixa a aba ativa visível (sem mexer na rolagem da página). */
export function scrollActiveIntoView(container: HTMLElement | null) {
  if (!container || container.scrollWidth <= container.clientWidth) return;
  const active = container.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return;
  const left = active.offsetLeft - container.offsetLeft;
  container.scrollLeft = Math.max(0, left - (container.clientWidth - active.offsetWidth) / 2);
}
