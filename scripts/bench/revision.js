import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

// A revision's tree, unpacked once under /tmp and keyed by commit, sharing this checkout's node_modules.
// Works in the jj checkout (jj resolves the revision, its colocated git store archives it) and in plain
// git worktrees.
const run = (command, args, options = {}) =>
	spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...options })

const commitId = (text) => (/^[0-9a-f]{40}$/.test(text?.trim() ?? '') ? text.trim() : null)

export const hasJj = (root) => run('jj', ['root'], { cwd: root }).status === 0

// The commit a revision names: jj syntax first when jj owns the checkout, git otherwise.
export function resolveCommit(root, revision) {
	if (hasJj(root)) {
		const jj = run('jj', ['log', '-r', revision, '--no-graph', '-T', 'commit_id ++ "\\n"'], {
			cwd: root,
		})
		const lines = jj.stdout?.trim().split('\n') ?? []
		if (jj.status === 0 && lines.length === 1 && commitId(lines[0])) return lines[0]
	}
	const git = run('git', ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], {
		cwd: root,
	})
	const id = git.status === 0 && commitId(git.stdout)
	if (!id) throw new Error(`--base ${revision}: no single commit by that name`)
	return id
}

// What the working copy is compared against when --base has no value: the commit under your edits.
// jj: @- (the working-copy commit holds the edits). git: HEAD when the tree is dirty, else origin/main.
export function defaultBase(root) {
	if (hasJj(root)) return '@-'
	const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root })
	return dirty.stdout?.trim() ? 'HEAD' : 'origin/main'
}

export function checkoutRevision(root, revision) {
	const commit = resolveCommit(root, revision)
	const dir = `/tmp/dodgethis-rev-${commit.slice(0, 12)}`
	if (!existsSync(join(dir, 'package.json'))) {
		const staging = mkdtempSync(`${dir}.partial-`)
		try {
			const archive = run('git', ['archive', '--format=tar', commit], {
				cwd: root,
				encoding: 'buffer',
			})
			if (archive.status !== 0)
				throw new Error(`git archive ${commit} failed: ${archive.stderr?.toString().trim()}`)
			const untar = run('tar', ['-x', '-C', staging], { input: archive.stdout })
			if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr.trim()}`)
			// A concurrent farm may have unpacked the same commit first; theirs is as good as ours.
			try {
				renameSync(staging, dir)
			} catch (error) {
				if (!existsSync(join(dir, 'package.json'))) throw error
				rmSync(staging, { recursive: true, force: true })
			}
		} catch (error) {
			rmSync(staging, { recursive: true, force: true })
			throw error
		}
	}
	const modules = join(dir, 'node_modules')
	if (!existsSync(modules)) {
		try {
			symlinkSync(realpathSync(join(root, 'node_modules')), modules)
		} catch (error) {
			if (error.code !== 'EEXIST') throw error
		}
	}
	return { root: dir, commit }
}
