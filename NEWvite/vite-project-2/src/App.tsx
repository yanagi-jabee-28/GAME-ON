import { useMemo, useState } from 'react'
import './App.css'

const PRIMES = [2, 3, 5, 7]

function randomProductUpTo(max: number) {
	// Generate a random number composed only of PRIMES (2,3,5,7) and <= max
	// Start from 1 and multiply random prime factors until next multiply would exceed max
	let val = 1
	const factors: number[] = []
	// To ensure some variability, attempt up to 20 multiplications
	for (let i = 0; i < 20; i++) {
		const p = PRIMES[Math.floor(Math.random() * PRIMES.length)]
		if (val * p > max) break
		val *= p
		factors.push(p)
		// small chance to stop early
		if (Math.random() < 0.25) break
	}
	// Ensure val > 1; if not, force at least one factor
	if (val === 1) {
		const p = PRIMES[Math.floor(Math.random() * PRIMES.length)]
		val = p
		factors.push(p)
	}
	return { value: val, factors }
}

function generateProblem(max = 1000) {
	// keep generating until <= max
	for (let i = 0; i < 1000; i++) {
		const { value } = randomProductUpTo(max)
		if (value >= 1 && value <= max) return value
	}
	return 1
}

function App() {
	const [target, setTarget] = useState(() => generateProblem(1000))
	const [current, setCurrent] = useState<number>(target)
	const [history, setHistory] = useState<number[]>([])
	const [message, setMessage] = useState<string>('')

	// When target changes, reset current and history
	useMemo(() => {
		setCurrent(target)
		setHistory([])
		setMessage('')
	}, [target])

	const pressPrime = (p: number) => {
		if (current % p !== 0) {
			setMessage(`${p}で割れません`)
			return
		}
		const next = current / p
		setCurrent(next)
		setHistory((h) => [...h, p])
		setMessage('')
		if (next === 1) {
			setMessage('正解！ 新しい問題を作成してください。')
		}
	}

	const reset = () => {
		const n = generateProblem(1000)
		setTarget(n)
	}

	const giveUp = () => {
		setMessage(`答え: ${target} = ${history.length ? history.join(' × ') : ''} × ${current}`)
		setCurrent(1)
	}

	return (
		<div>
			<h1>素因数分解ゲーム</h1>
			<p>目標（問題）: <strong>{target}</strong></p>
			<p>現在の値: <strong>{current}</strong></p>

			<div style={{ margin: '1rem 0' }}>
				{PRIMES.map((p) => (
					<button
						key={p}
						onClick={() => pressPrime(p)}
						style={{ fontSize: '1.25rem', margin: '0.25rem', padding: '0.5rem 1rem' }}
					>
						{p}
					</button>
				))}
			</div>

			<div style={{ marginTop: '1rem' }}>
				<button onClick={reset} style={{ marginRight: '0.5rem' }}>
					新しい問題
				</button>
				<button onClick={giveUp}>ギブアップ</button>
			</div>

			<div style={{ marginTop: '1rem' }}>
				<p>操作履歴: {history.join(' × ') || '—'}</p>
				<p style={{ color: message.includes('正解') ? 'green' : 'red' }}>{message}</p>
			</div>
		</div>
	)
}

export default App
