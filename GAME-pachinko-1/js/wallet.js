// SharedWallet: simple shared balance/debt store between Pachinko and Slot
(function () {
	const defaultCfg = {
		enabled: true,
		initialBalance: 1000,
		currency: 'JPY',
		ballCost: 1, // cost per ball spawn
		credit: { enabled: true, creditLimit: 0, interestRate: 0 }
	};

	function clampNum(n) { return Number.isFinite(n) ? n : 0; }

	const Wallet = {
		_inited: false,
		enabled: true,
		balance: 0,
		debt: 0,
		credit: { enabled: false, creditLimit: 0, interestRate: 0 },
		ballCost: 1,
		currency: 'JPY',
		initFromConfig: function (cfg) {
			if (this._inited) return;
			const wcfg = (cfg && cfg.wallet) ? cfg.wallet : {};
			this.enabled = (wcfg.enabled !== false);
			this.balance = clampNum(wcfg.initialBalance ?? defaultCfg.initialBalance);
			this.currency = wcfg.currency || defaultCfg.currency;
			this.ballCost = clampNum(wcfg.ballCost ?? defaultCfg.ballCost);
			const c = wcfg.credit || defaultCfg.credit;
			this.credit = { enabled: !!c.enabled, creditLimit: clampNum(c.creditLimit), interestRate: clampNum(c.interestRate) };
			this._inited = true;
			this._emit();
			try { console.log('[SharedWallet] init', { balance: this.balance, debt: this.debt, credit: this.credit, ballCost: this.ballCost }); } catch (_) { }
		},
		canSpend: function (amount) {
			amount = Math.max(0, clampNum(amount));
			if (!this.credit.enabled) return this.balance >= amount;
			const availableCredit = Math.max(0, this.credit.creditLimit - this.debt);
			return (this.balance + availableCredit) >= amount;
		},
		spend: function (amount) {
			amount = Math.max(0, clampNum(amount));
			if (!this.canSpend(amount)) return false;
			if (amount <= this.balance) {
				this.balance -= amount;
			} else {
				const need = amount - this.balance;
				this.balance = 0;
				if (this.credit.enabled && need > 0) {
					const interest = Math.ceil(need * (this.credit.interestRate || 0));
					this.debt += need + interest;
				}
			}
			this._emit();
			return true;
		},
		add: function (amount) {
			amount = clampNum(amount);
			if (amount <= 0) return;
			// first repay debt automatically
			if (this.debt > 0) {
				const repay = Math.min(this.debt, amount);
				this.debt -= repay; amount -= repay;
			}
			if (amount > 0) this.balance += amount;
			this._emit();
		},
		setBalance: function (v) { this.balance = Math.max(0, clampNum(v)); this._emit(); },
		setDebt: function (v) { this.debt = Math.max(0, clampNum(v)); this._emit(); },
		_emit: function () {
			try { window.dispatchEvent(new CustomEvent('wallet:changed', { detail: { balance: this.balance, debt: this.debt } })); } catch (_) { }
			// reflect to simple HUD if exists
			const el = document.getElementById('wallet-balance');
			if (el) el.textContent = this.balance.toLocaleString();
			const elD = document.getElementById('wallet-debt');
			if (elD) elD.textContent = this.debt.toLocaleString();
		},
		ensureHud: function () {
			if (document.getElementById('wallet-hud')) return;
			const host = document.querySelector('.controls') || document.body;
			const wrap = document.createElement('div');
			wrap.id = 'wallet-hud';
			wrap.style.display = 'inline-flex';
			wrap.style.gap = '12px';
			wrap.style.marginLeft = '12px';
			wrap.style.alignItems = 'center';
			wrap.innerHTML = '\n        <div class="wallet-item">残高: <strong id="wallet-balance">0</strong></div>\n        <div class="wallet-item" style="opacity:.8">借金: <strong id="wallet-debt">0</strong></div>\n      ';
			host && host.appendChild(wrap);
			this._emit();
		}
	};

	// expose
	window.SharedWallet = Wallet;
	// auto-init when config available
	try { if (window.GAME_CONFIG) Wallet.initFromConfig(window.GAME_CONFIG); } catch (_) { }
	// show HUD after DOM ready
	try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Wallet.ensureHud()); else Wallet.ensureHud(); } catch (_) { }
})();
