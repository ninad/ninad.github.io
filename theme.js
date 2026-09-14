(function () {
	'use strict';
	var root = document.documentElement;
	var storageKey = 'site-theme';
	var saved = null;

	try {
		saved = localStorage.getItem(storageKey);
		localStorage.removeItem('gallery-theme');
	} catch (_) {}

	function localTimeTheme() {
		var hour = new Date().getHours();
		return hour >= 18 || hour < 7 ? 'dim' : 'light';
	}

	root.classList.toggle('dimmed', (saved || localTimeTheme()) === 'dim');

	function mountToggle() {
		var toggle = document.getElementById('themeToggle');
		if (!toggle) {
			toggle = document.createElement('button');
			toggle.type = 'button';
			toggle.id = 'themeToggle';
			toggle.className = 'theme-toggle';
			document.body.appendChild(toggle);
		}

		function update() {
			var dimmed = root.classList.contains('dimmed');
			toggle.setAttribute('aria-pressed', String(dimmed));
			toggle.textContent = dimmed ? 'light' : 'dim';
		}

		update();
		toggle.addEventListener('click', function () {
			var dimmed = !root.classList.contains('dimmed');
			root.classList.toggle('dimmed', dimmed);
			update();
			try {
				localStorage.setItem(storageKey, dimmed ? 'dim' : 'light');
				localStorage.removeItem('gallery-theme');
			} catch (_) {}
		});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
	else mountToggle();
})();
