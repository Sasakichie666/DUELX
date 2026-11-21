// js/core/tokenManager.js
// ★衍生物（token）核心：判定 / 列表 / 空格 / 生成落格
//
// 定位：
//   · 衍生物是卡库里的卡（type==='token' 或 series 含「衍生物」✓），不进卡组 ✓
//   · 生成 = 用卡面数据造一个实例 → 放进前场/后场空格 → 触发入场时点 → 同步给对方 ✓
//   · 离场即消失：实例带 isToken 标记（cardMover 负责清理）

(function(global) {
    const FIELD_ZONES = ['frontField', 'backField'];

    function L() { return global.CardLibrary; }

    /** 这张卡是不是衍生物（判定单一出处 = CardLibrary.isToken ✓） */
    function isTokenCard(card) {
        const lib = L();
        return !!(lib && lib.isToken && lib.isToken(card));
    }

    /** 卡库里所有衍生物（生成面板用 ✓） */
    /** ★衍生物的"底色"：有攻防 = 随从类 / 没有 = 战术类（也可用 baseType 显式指定 ✓） */
    function kindOf(card) {
        if (!card) return 'tactic';
        if (card.baseType === 'minion' || card.baseType === 'tactic') return card.baseType;
        const hasStats = (typeof card.attack === 'number') && (typeof card.defense === 'number');
        return hasStats ? 'minion' : 'tactic';
    }

    function listTokenCards() {
        const lib = L();
        if (!lib || !lib.getAllCards) return [];
        return lib.getAllCards().filter(isTokenCard);
    }

    /** 前场 / 后场的空格下标：{ frontField:[...], backField:[...] } */
    function emptySlots(side) {
        const p = global.GameState ? global.GameState.getPlayerState(side || 'self') : null;
        const out = { frontField: [], backField: [] };
        if (!p) return out;
        FIELD_ZONES.forEach(z => {
            const arr = p[z] || [];
            for (let i = 0; i < arr.length; i++) if (!arr[i]) out[z].push(i);
        });
        return out;
    }

    function hasEmptySlot(side) {
        const e = emptySlots(side);
        return (e.frontField.length + e.backField.length) > 0;
    }

    /**
     * 生成一只衍生物到指定格
     * @param {object} cardData 卡库里的衍生物卡
     * @param {'self'|'opponent'} side
     * @param {'frontField'|'backField'} zone
     * @param {number} index
     * @param {object} [opts] { emitEntry:false 可不触发入场时点 }
     */
    function spawn(cardData, side, zone, index, opts) {
        const o = opts || {};
        const owner = side === 'opponent' ? 'opponent' : 'self';
        const z = FIELD_ZONES.indexOf(zone) >= 0 ? zone : 'frontField';
        const p = global.GameState ? global.GameState.getPlayerState(owner) : null;
        if (!p || !cardData) return { error: '无法生成衍生物' };
        const arr = p[z] || [];
        if (arr[index]) return { error: '目标格子已被占用' };

        const inst = global.GameState.createCardInstance(cardData.id, owner);
        inst.cardData = cardData;
        inst.isToken = true;                                  // ★衍生物标记（离场即消失 ✓）
        inst.owner = owner;
        inst.controller = owner;
            inst.currentAttack = (typeof cardData.attack === 'number') ? cardData.attack : null;
            inst.currentDefense = (typeof cardData.defense === 'number') ? cardData.defense : null;
        inst.active = true;
        inst.faceDown = false;
        inst.zone = z;
        inst.zoneIndex = index;
        inst.enteredThisTurn = (z === 'frontField');
        arr[index] = inst;
        if (global.ControlManager && global.ControlManager.setOrigin) global.ControlManager.setOrigin(inst, 'token');

        // ★生成触发入场时点（与正常登场同一条流水线 ✓）
        if (o.emitEntry !== false && global.CardEntry && global.CardEntry.afterZoneEnter) {
            global.CardEntry.afterZoneEnter(inst.instanceId, z, null, {});
        }
        // 统一提交：写战报 + 通知对手 + 重绘 + 同步 ✓
        if (global.StateCommit && global.StateCommit.commit) {
            global.StateCommit.commit('生成衍生物「' + (cardData.name || '') + '」');
        }
        // ★把公开状态同步给对方（与 ControlManager.settle 同口径 ✓ 否则对面看不到衍生物 ✗）
        if (global.SyncManager && global.SyncManager.sendPublicState) global.SyncManager.sendPublicState(owner);
        return { success: true, instance: inst };
    }

    /** ★生成 N 张衍生物【直接进手牌】（不进战场 → 不触发入场时点 ✓） */
    function spawnToHand(cardData, side, count) {
        const owner = side === 'opponent' ? 'opponent' : 'self';
        const p = global.GameState ? global.GameState.getPlayerState(owner) : null;
        if (!p || !cardData) return { error: '无法生成衍生物' };
        const n = Math.max(1, Math.min(99, parseInt(count, 10) || 1));
        let made = 0;
        for (let i = 0; i < n; i++) {
            const inst = global.GameState.createCardInstance(cardData.id, owner);
            inst.cardData = cardData;
            inst.isToken = true;
            inst.owner = owner;
            inst.controller = owner;
            inst.currentAttack = (typeof cardData.attack === 'number') ? cardData.attack : null;
            inst.currentDefense = (typeof cardData.defense === 'number') ? cardData.defense : null;
            inst.active = true;
            inst.faceDown = false;
            inst.zone = 'hand';
            p.hand.push(inst);
            inst.zoneIndex = p.hand.length - 1;
            if (global.ControlManager && global.ControlManager.setOrigin) global.ControlManager.setOrigin(inst, 'token');
            made++;
        }
        if (global.CardActions && global.CardActions.updateHandCounts) global.CardActions.updateHandCounts(p);
        if (global.StateCommit && global.StateCommit.commit) global.StateCommit.commit('衍生物加入手牌「' + (cardData.name || '') + '」×' + made);
        if (global.SyncManager && global.SyncManager.sendPublicState) global.SyncManager.sendPublicState(owner);
        return { success: true, count: made };
    }
    global.TokenManager = { kindOf, FIELD_ZONES, isTokenCard, listTokenCards, emptySlots, hasEmptySlot, spawn, spawnToHand };
})(window);
