// Shared by every page: click any picture to see it large. ← → browse, Esc or a click outside closes.
document.head.insertAdjacentHTML(
	'beforeend',
	`<style>
.media{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.media :is(img,video){aspect-ratio:16/10}
main img:not(a img),.media img{cursor:zoom-in}
dialog.viewer{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#111e;color:#ddd}
dialog.viewer img{display:block;width:100%;height:calc(100% - 32px);object-fit:contain;margin:0;padding:0;cursor:default;border:0;background:none;aspect-ratio:auto}
dialog.viewer p{margin:0;text-align:center;line-height:32px}
</style>`,
)
const viewer = document.createElement('dialog')
viewer.className = 'viewer'
viewer.innerHTML = '<img /><p></p>'
document.body.append(viewer)
let imgs = []
let index = 0
const show = (i) => {
	index = (i + imgs.length) % imgs.length
	viewer.querySelector('img').src = imgs[index].currentSrc || imgs[index].src
	viewer.querySelector('p').textContent =
		`${index + 1} / ${imgs.length} · ${imgs[index].alt} · ← → to browse, Esc to close`
}
const viewable = (el) => el.tagName === 'IMG' && !el.closest('dialog, a, button')
document.addEventListener('click', (e) => {
	if (viewable(e.target)) {
		imgs = [...document.querySelectorAll('img')].filter(viewable)
		show(imgs.indexOf(e.target))
		viewer.showModal()
	} else if (e.target.closest('dialog.viewer')) viewer.close()
})
document.addEventListener('keydown', (e) => {
	if (!viewer.open) return
	if (e.key === 'ArrowRight') show(index + 1)
	if (e.key === 'ArrowLeft') show(index - 1)
})
