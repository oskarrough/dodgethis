// Create an element with an optional class, parent to append to, and innerHTML.
export function el(tag, className, parent, html) {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (html) node.innerHTML = html
	parent?.append(node)
	return node
}
