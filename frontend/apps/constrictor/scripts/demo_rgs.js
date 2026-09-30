// In-page stand-in for the Stake RGS, for the shareable demo only (scripts/make_demo.py). Not part of the
// submission. It answers the wallet calls the game makes with REAL books from the math (a LUT-weighted sample,
// the same one the local mock RGS uses), so play is representative. The balance is play money and resets on reload.
(function () {
	var RGS = 'https://demo-rgs.invalid';
	var API = 1000000;
	var COSTS = __COSTS__;
	var LEVELS = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000].map(function (x) {
		return Math.round(x * API);
	});
	var state = { balance: 10000 * API, currency: 'USD', active: null };
	var orig = window.fetch.bind(window);
	var books = {};

	// The game reads its launch settings from the query string, which an embedded page does not receive.
	try {
		if (!new URLSearchParams(location.search).get('sessionID')) {
			history.replaceState(null, '', './?sessionID=demo&rgs_url=' + encodeURIComponent(RGS) + '&currency=USD&lang=en');
		}
	} catch (e) {
		/* the game then shows its own "no session" message */
	}

	function load(mode) {
		if (!books[mode]) {
			books[mode] = orig('./books/' + mode + '.json').then(function (r) {
				if (!r.ok) throw new Error('books ' + mode);
				return r.json();
			});
			books[mode].catch(function () {
				delete books[mode];
			});
		}
		return books[mode];
	}
	load('base');

	var bal = function () {
		return { amount: state.balance, currency: state.currency };
	};
	var fail = function (code) {
		return [400, { error: code, message: code }];
	};

	function handle(path, b) {
		if (path === '/wallet/authenticate') {
			return Promise.resolve([200, {
				balance: bal(),
				round: state.active ? Object.assign({}, state.active, { active: true }) : null,
				config: { gameID: 'constrictor', minBet: LEVELS[0], maxBet: LEVELS[LEVELS.length - 1], stepBet: 10000, defaultBetLevel: API, betLevels: LEVELS, jurisdiction: {} },
			}]);
		}
		if (path === '/wallet/play') {
			var mode = b.mode || 'base';
			var amount = b.amount;
			if (!(mode in COSTS) || LEVELS.indexOf(amount) < 0 || state.active) return Promise.resolve(fail('ERR_VAL'));
			var cost = Math.round(amount * COSTS[mode]);
			if (cost > state.balance) return Promise.resolve(fail('ERR_IPB'));
			return load(mode).then(function (list) {
				var book = list[Math.floor(Math.random() * list.length)];
				state.balance -= cost;
				var rnd = {
					betID: book.id,
					amount: amount,
					payout: Math.floor((amount * book.payoutMultiplier) / 100),
					payoutMultiplier: book.payoutMultiplier / 100,
					costMultiplier: COSTS[mode],
					active: book.payoutMultiplier > 0,
					mode: mode,
					event: String(book.id),
					state: book.events,
				};
				if (rnd.active) state.active = rnd;
				return [200, { balance: bal(), round: rnd }];
			});
		}
		if (path === '/wallet/end-round') {
			if (state.active) {
				state.balance += state.active.payout;
				state.active = null;
			}
			return Promise.resolve([200, { balance: bal() }]);
		}
		if (path === '/wallet/balance') return Promise.resolve([200, { balance: bal() }]);
		if (path === '/bet/event') return Promise.resolve([200, { event: b.event || '' }]);
		return Promise.resolve([404, { error: 'ERR_VAL', message: 'ERR_VAL' }]);
	}

	window.fetch = function (input, init) {
		var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
		if (url.indexOf(RGS) !== 0) return orig(input, init);
		var body = {};
		try {
			body = JSON.parse((init && init.body) || '{}');
		} catch (e) {
			/* empty body */
		}
		var path = url.slice(RGS.length).split('?')[0];
		return handle(path, body).then(
			function (r) {
				return new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'Content-Type': 'application/json' } });
			},
			function () {
				return new Response(JSON.stringify({ error: 'ERR_GEN', message: 'ERR_GEN' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
			},
		);
	};
})();
