// js/interaction/tokenPlacement.js
// ★衍生物「生成阶段」：连续选格放置 N 只（前场 / 后场都能放 ✓）
//
// 规则（需求）：
//   · 确认数量后，前场/后场的【空格亮起】→ 点一格放一只
//   · 数量 ≥ 2：放完一只还有剩余 → 继续亮起，直到放完或没有空格 ✓
//   · 放完之前属于【生成阶段】→ 其它点击一律挡住（blockIfActive ✓）
//   · Esc / 右键 / 「取消」→ 结束并解锁 ✓

(function(global) {
    const ZONES = ['frontField', 'backField'];

    let active = false;
    let cardData = null;
    let remaining = 0;
    let placed = 0;

    function isActive() { return active; }

    /** 其它入口的统一门禁：生成阶段中 → 拦住并提示 ✓ */
    function blockIfActive() {
        if (!active) return false;
        if (global.UI && global.UI.showNotification) {
            global.UI.showNotification('正在生成衍生物：请点亮的格子放置，或按 Esc 取消', 'warning', 2200);
        }
        return true;
    }

    function notify(msg, type) {
        if (global.UI && global.UI.showNotification) global.UI.showNotification(msg, type || 'info', 2500);
    }

    /** 开始生成（count = 数量） */
    function start(card, count) {
        if (active) cancel();
        if (!card) return false;
        const n = Math.max(1, Math.min(99, parseInt(count, 10) || 1));
        if (!global.TokenManager || !global.TokenManager.hasEmptySlot('self')) {
            notify('前场 / 后场已经没有空格了', 'warning');
            return false;
        }
        active = true;
        cardData = card;
        remaining = n;
        placed = 0;
        document.body.classList.add('token-placing');   // ★CSS 兜底：挡住其它点击 ✓
        pickNext();
        return true;
    }

    /** 亮起空格，等下一次点击（连续生成就靠它递归 ✓） */
    function pickNext() {
        const TM = global.TokenManager;
        if (!TM || !TM.hasEmptySlot('self')) { finish('前场 / 后场已满'); return; }
        const ok = global.TargetFlowUI && global.TargetFlowUI.startSelectionOnSide(
            ZONES, 'self', onPick, () => finish('已取消')
        );
        if (!ok) finish('没有可用的空位');
    }

    function onPick(index, slot, zone) {
        if (!active) return;
        const res = global.TokenManager.spawn(cardData, 'self', zone, index);
        if (res && res.error) notify(res.error, 'warning');
        else placed++;
        remaining--;
        if (remaining > 0) pickNext();        // ★还有剩余 → 继续亮格子 ✓
        else finish('');
    }

    /** 结束阶段（内部）：清高亮 + 解锁 + 汇总提示 ✓ */
    function finish(msg) {
        const wasActive = active;
        const done = placed;
        active = false;
        cardData = null;
        remaining = 0;
        placed = 0;
        document.body.classList.remove('token-placing');
        if (global.TargetFlowUI && global.TargetFlowUI.cancelSelection) global.TargetFlowUI.cancelSelection();
        if (!wasActive) return;
        if (msg) notify('衍生物生成结束：' + msg, 'info');
        else notify('已生成 ' + done + ' 只衍生物 ✓', 'success');
        // ★统一走 StateCommit（不许直接调 UI.refreshAll ✗ 守门测试会拦 ✓）
        if (global.StateCommit && global.StateCommit.refresh) global.StateCommit.refresh();   // 清掉残留高亮 ✓
    }

    function cancel() { finish('已取消'); }

    global.TokenPlacement = { isActive, blockIfActive, start, cancel, ZONES };
})(window);
