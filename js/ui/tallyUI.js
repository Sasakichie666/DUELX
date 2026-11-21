// js/ui/tallyUI.js
// ★计数：玩家自定义的「名称 + 数值」小徽章（可多个 ✓，双方可见 ✓）
//
// 需求：
//   · 侧栏「计数」按钮 → 弹窗填名称 + 数值 → 出现在【我方手牌数 UI 旁边】
//   · 点数值 = 弹「+1 / −1」小面板（与血量修改同款）；点名称 = 改名；悬浮 ✕ = 删除
//   · ★双方可见的公共信息：数据存在 GameState（players.self/opponent.tallies）→
//     随公开快照同步给对方 ✓（每次改动后 StateCommit.commit + SyncManager.sendPublicState）
//   · ★新对局不保留：GameState.initGame 会重建玩家状态 → tallies 自动清空 ✓

(function(global) {
    const MAX_TALLIES = 12;
    const MAX_NAME_LEN = 12;
    const LEGACY_KEY = 'cardgame.tallies.v1';     // 旧版本的本机存储（启动时清掉 ✓）

    let selfBar = null;
    let oppBar = null;
    let modalEl = null;
    let parts = null;
    let popEl = null;
    let onOkFn = null;
    let uid = 0;

    /* ---------- 数据（★在 GameState 里 → 双方同步、新对局清空 ✓） ---------- */
    function playerOf(side) {
        return global.GameState ? global.GameState.getPlayerState(side) : null;
    }

    function listOf(side) {
        const p = playerOf(side);
        if (!p) return [];
        if (!Array.isArray(p.tallies)) p.tallies = [];
        return p.tallies;
    }

    function mine() { return listOf('self'); }
    function theirs() { return listOf('opponent'); }

    function newId() { uid++; return 'tl_' + Date.now().toString(36) + '_' + uid; }

    /** 改动后统一收尾：写战报 + 通知 + 重绘 + ★把公开状态发给对方 ✓ */
    function commit(text) {
        if (global.StateCommit && global.StateCommit.commit) global.StateCommit.commit(text || '');
        else if (global.StateCommit && global.StateCommit.refresh) global.StateCommit.refresh();
        if (global.SyncManager && global.SyncManager.sendPublicState) global.SyncManager.sendPublicState('self');
        render();
    }

    /* ---------- 新建计数弹窗（名称 + 数值） ---------- */
    function ensureModal() {
        if (modalEl && document.body.contains(modalEl)) return modalEl;
        const el = document.createElement('div');
        el.className = 'modal-mask no-blur';
        el.hidden = true;
        el.innerHTML = `
            <div class="modal modal-sm" role="dialog" aria-modal="true">
                <header class="modal-head">
                    <h3>🔢 新建计数</h3>
                    <button type="button" class="modal-close" data-act="close" aria-label="关闭">✕</button>
                </header>
                <p class="modal-hint">加一个「名称 + 数值」的计数（双方都能看到 ✓）。之后点数值 → +1/−1、点名称 → 改名、悬浮 → ✕ 删除。</p>
                <div class="modal-sec">
                    <div class="modal-sec-title">名称</div>
                    <input type="text" class="tally-input" data-act="name" maxlength="${MAX_NAME_LEN}" placeholder="例如：中毒 / 回合数 / 龙魂">
                </div>
                <div class="modal-sec">
                    <div class="modal-sec-title">数值</div>
                    <input type="number" class="tally-input" data-act="value" value="0" step="1">
                </div>
                <footer class="modal-foot">
                    <button type="button" class="btn" data-act="cancel">取消</button>
                    <button type="button" class="btn btn-success" data-act="ok">✅ 创建</button>
                </footer>
            </div>`;
        document.body.appendChild(el);
        modalEl = el;
        parts = { name: el.querySelector('[data-act="name"]'), value: el.querySelector('[data-act="value"]') };
        el.addEventListener('click', (e) => {
            if (e.target === el) { closeDialog(); return; }
            const btn = e.target.closest ? e.target.closest('[data-act]') : null;
            // ★只认按钮：输入框也带 data-act，点进去不能当按钮处理（否则一打字就关窗 ✗）
            if (!btn || btn.tagName !== 'BUTTON') return;
            const act = btn.getAttribute('data-act');
            if (act === 'ok') submitDialog(); else closeDialog();
        });
        parts.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitDialog(); });
        parts.value.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitDialog(); });
        return el;
    }

    function openDialog() {
        ensureModal();
        if (mine().length >= MAX_TALLIES) {
            if (global.UI) global.UI.showNotification('计数最多 ' + MAX_TALLIES + ' 个', 'warning');
            return false;
        }
        parts.name.value = '';
        parts.value.value = '0';
        modalEl.hidden = false;
        setTimeout(() => { try { parts.name.focus(); } catch (e) { } }, 30);
        return true;
    }

    function closeDialog() { if (modalEl) modalEl.hidden = true; }

    function submitDialog() {
        const name = String(parts.name.value || '').trim().slice(0, MAX_NAME_LEN) || '计数';
        const value = Number(parts.value.value) || 0;
        const item = addTally(name, value);
        if (item) closeDialog();
        return !!item;
    }

    /* ---------- 渲染（我方 + 对方两个条 ✓） ---------- */
    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function chipHtml(t, editable) {
        return '<span class="tally-chip' + (editable ? '' : ' is-readonly') + '" data-tally-id="' + esc(t.id) + '"'
            + (editable ? ' title="点数值 → +1 / −1，点名称 → 改名，悬浮 → ✕ 删除"' : ' title="对方的计数（只读）"') + '>'
            + '<span class="tally-name" data-act="name">' + esc(t.name) + '</span>'
            + '<span class="tally-value" data-act="value">' + (Number(t.value) || 0) + '</span>'
            + (editable ? '<button type="button" class="tally-x" data-act="del" title="删除这个计数">✕</button>' : '')
            + '</span>';
    }

    function render() {
        if (selfBar) selfBar.innerHTML = mine().map(t => chipHtml(t, true)).join('');
        if (oppBar) oppBar.innerHTML = theirs().map(t => chipHtml(t, false)).join('');
    }

    /* ---------- 动作（★改完都 commit → 对方立刻同步 ✓） ---------- */
    function find(id) { return mine().filter(t => t.id === id)[0] || null; }

    function addTally(name, value) {
        const arr = mine();
        if (arr.length >= MAX_TALLIES) return null;
        const item = { id: newId(), name: String(name || '计数').slice(0, MAX_NAME_LEN), value: Number(value) || 0 };
        arr.push(item);
        commit('新建计数「' + item.name + '」：' + item.value);
        return item;
    }

    function bump(id, delta) {
        const t = find(id);
        if (!t) return null;
        t.value = (Number(t.value) || 0) + (Number(delta) || 0);
        commit('计数「' + t.name + '」→ ' + t.value);
        return t.value;
    }

    function setValue(id, value) {
        const t = find(id);
        if (!t) return null;
        t.value = Number(value) || 0;
        commit('计数「' + t.name + '」→ ' + t.value);
        return t.value;
    }

    function rename(id) {
        const t = find(id);
        if (!t) return null;
        if (global.TextPromptUI && global.TextPromptUI.ask) {
            global.TextPromptUI.ask({
                title: '重命名计数', label: '名称', value: t.name, maxLength: MAX_NAME_LEN,
                onOk: (text) => {
                    const cur = find(id);
                    if (!cur) return;
                    cur.name = String(text).trim().slice(0, MAX_NAME_LEN) || cur.name;
                    commit('计数改名「' + cur.name + '」');
                }
            });
            return t.name;
        }
        return t.name;
    }

    function removeTally(id) {
        const arr = mine();
        const i = arr.findIndex(t => t.id === id);
        if (i < 0) return false;
        const name = arr[i].name;
        arr.splice(i, 1);
        commit('删除计数「' + name + '」');
        return true;
    }

    /* ---------- 数值面板：+1 / −1（与血量修改同款 ✓） ---------- */
    function ensurePop() {
        if (popEl && document.body.contains(popEl)) return popEl;
        const el = document.createElement('div');
        el.className = 'tally-pop';
        el.hidden = true;
        el.innerHTML = '<button type="button" class="tally-pop-btn" data-step="1">+1</button>'
            + '<button type="button" class="tally-pop-btn" data-step="-1">−1</button>';
        document.body.appendChild(el);
        el.addEventListener('click', (e) => {
            const btn = e.target.closest ? e.target.closest('[data-step]') : null;
            if (!btn) return;
            e.stopPropagation();
            bump(el.getAttribute('data-tally-id'), Number(btn.getAttribute('data-step')));
        });
        popEl = el;
        return el;
    }

    function openValuePop(anchorEl, id) {
        ensurePop();
        popEl.setAttribute('data-tally-id', id);
        popEl.hidden = false;
        const rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
        if (rect) {
            popEl.style.left = Math.round(rect.left) + 'px';
            popEl.style.top = Math.round(rect.bottom + 6) + 'px';
        }
        bindOutsideClose();
    }

    function closeValuePop() { if (popEl) popEl.hidden = true; }

    function bindOutsideClose() {
        if (bindOutsideClose._bound) return;
        bindOutsideClose._bound = true;
        document.addEventListener('click', (e) => {
            if (!popEl || popEl.hidden) return;
            if (popEl.contains(e.target)) return;
            if (e.target.closest && e.target.closest('.tally-value')) return;
            closeValuePop();
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeValuePop(); });
    }

    /* ---------- 初始化 ---------- */
    function init() {
        selfBar = document.getElementById('selfTallyBar');
        oppBar = document.getElementById('opponentTallyBar');
        // 旧版本的本机存储 → 不再使用（清掉，避免跨局残留 ✗）
        try { if (global.localStorage) global.localStorage.removeItem(LEGACY_KEY); } catch (e) { }
        render();
        if (selfBar && !selfBar._bound) {
            selfBar._bound = true;
            selfBar.addEventListener('click', (e) => {
                const chip = e.target.closest ? e.target.closest('.tally-chip') : null;
                if (!chip) return;
                const id = chip.getAttribute('data-tally-id');
                const actEl = e.target.closest ? e.target.closest('[data-act]') : null;
                const act = actEl ? actEl.getAttribute('data-act') : '';
                if (act === 'del') { removeTally(id); return; }
                if (act === 'name') { rename(id); return; }
                if (act === 'value') { openValuePop(actEl, id); return; }
            });
            selfBar.addEventListener('contextmenu', (e) => {
                const chip = e.target.closest ? e.target.closest('.tally-chip') : null;
                if (!chip) return;
                e.preventDefault();
                bump(chip.getAttribute('data-tally-id'), -1);
            });
        }
        return !!selfBar;
    }

    global.TallyUI = {
        MAX_TALLIES, MAX_NAME_LEN,
        init, open: openDialog, render, addTally, bump, setValue, rename, removeTally,
        list: () => mine().map(t => ({ id: t.id, name: t.name, value: t.value })),
        opponentList: () => theirs().map(t => ({ id: t.id, name: t.name, value: t.value }))
    };
})(window);
