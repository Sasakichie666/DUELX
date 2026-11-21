// js/ui/tokenUI.js
// ★衍生物选择弹窗：列出卡库里所有衍生物 → 选一张 + 填数量 → 确认进入「生成阶段」
//   · 卡面复用 CardUI.createCardElement（与查阅面板同款 viewer-card ✓）
//   · 真正的放置由 js/interaction/tokenPlacement.js 负责（本文件只管选卡与数量 ✓）

(function(global) {
    const TokenUI = {
        overlay: null,
        parts: null,
        cards: [],
        selectedId: '',
        count: 1,

        ensure() {
            if (this.overlay && document.body.contains(this.overlay)) return this.overlay;
            const el = document.createElement('div');
            el.className = 'token-mask';
            el.hidden = true;
            el.innerHTML = `
                <div class="token-panel" role="dialog" aria-modal="true">
                    <header class="token-head">
                        <h3>🌀 衍生物</h3>
                        <button type="button" class="token-close" title="关闭（Esc）">✕</button>
                    </header>
                    <p class="token-hint">选一张衍生物 → 填数量 → 确认后【前场/后场的空格会亮起】，点格子放置。</p>
                    <div class="pv-grid token-grid"></div>
                    <footer class="token-bar">
                        <span class="token-count-label">数量</span>
                        <button type="button" class="token-step" data-step="-1">−</button>
                        <input class="token-count" type="number" min="1" max="99" value="1">
                        <button type="button" class="token-step" data-step="1">＋</button>
                        <span class="token-spacer"></span>
                        <button type="button" class="token-btn token-cancel">取消</button>
                        <button type="button" class="token-btn token-ok">✅ 确认生成</button>
                    </footer>
                </div>`;
            document.body.appendChild(el);
            this.overlay = el;
            this.parts = {
                grid: el.querySelector('.token-grid'),
                hint: el.querySelector('.token-hint'),
                count: el.querySelector('.token-count'),
                ok: el.querySelector('.token-ok'),
                cancel: el.querySelector('.token-cancel'),
                close: el.querySelector('.token-close')
            };
            this.parts.close.addEventListener('click', () => this.close());
            this.parts.cancel.addEventListener('click', () => this.close());
            this.parts.ok.addEventListener('click', () => this.confirm());
            el.querySelectorAll('.token-step').forEach(btn => {
                btn.addEventListener('click', () => this.setCount(this.count + Number(btn.dataset.step)));
            });
            this.parts.count.addEventListener('change', () => this.setCount(parseInt(this.parts.count.value, 10)));
            el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
            this.parts.grid.addEventListener('click', (e) => {
                const cell = e.target.closest ? e.target.closest('.token-cell') : null;
                if (!cell) return;
                this.select(cell.getAttribute('data-card-id'));
            });
            return el;
        },

        /** ★侧栏点「衍生物」→ 先选方式：战场生成 / 加入手牌 ✓ */
        openChooser() {
            if (!this._chooser) {
                const el = document.createElement('div');
                el.className = 'modal-mask no-blur';
                el.hidden = true;
                el.innerHTML = `
                    <div class="modal modal-sm" role="dialog" aria-modal="true">
                        <header class="modal-head">
                            <h3>🌀 衍生物</h3>
                            <button type="button" class="modal-close" data-tok="close" aria-label="关闭">✕</button>
                        </header>
                        <p class="modal-hint">要放到哪里？</p>
                        <div class="token-choose">
                            <button type="button" class="token-choose-btn" data-tok="field">
                                <b>⚔️ 战场生成</b><small>确认后点亮前场/后场空格，点格子放置</small>
                            </button>
                            <button type="button" class="token-choose-btn" data-tok="hand">
                                <b>🖐 加入手牌</b><small>确认后直接生成 N 张到你的手牌</small>
                            </button>
                        </div>
                    </div>`;
                document.body.appendChild(el);
                el.addEventListener('click', (e) => {
                    if (e.target === el) { el.hidden = true; return; }
                    const btn = e.target.closest ? e.target.closest('[data-tok]') : null;
                    if (!btn || btn.tagName !== 'BUTTON') return;
                    const act = btn.getAttribute('data-tok');
                    el.hidden = true;
                    if (act === 'field') this.open('field');
                    else if (act === 'hand') this.open('hand');
                });
                this._chooser = el;
            }
            this._chooser.hidden = false;
            return true;
        },

        open(mode) {
            this.ensure();
            this.mode = mode === 'hand' ? 'hand' : 'field';
            this.cards = (global.TokenManager && global.TokenManager.listTokenCards) ? global.TokenManager.listTokenCards() : [];
            this.selectedId = '';
            this.count = 1;
            if (this.parts.count) this.parts.count.value = '1';
            this.renderGrid();
            if (this.parts.hint) {
                this.parts.hint.textContent = this.mode === 'hand'
                    ? '选一张衍生物 → 填数量 → 确认后【直接加入你的手牌】✓'
                    : '选一张衍生物 → 填数量 → 确认后【前场/后场的空格会亮起】，点格子放置 ✓';
            }
            this.overlay.hidden = false;
            return true;
        },

        close() { if (this.overlay) this.overlay.hidden = true; },

        renderGrid() {
            const g = this.parts && this.parts.grid;
            if (!g) return;
            g.innerHTML = '';
            if (!this.cards.length) {
                g.innerHTML = '<p class="token-empty">卡库里还没有衍生物卡 ✗<br>到【卡牌编辑器】把卡的 series 写成「衍生物」（或类型设为衍生物）再导入卡包 ✓</p>';
                return;
            }
            const cardDataOf = (id) => this.cards.filter(c => c.id === id)[0] || null;
            this.cards.forEach(card => {
                const cell = document.createElement('div');
                cell.className = 'token-cell' + (card.id === this.selectedId ? ' is-selected' : '');
                cell.setAttribute('data-card-id', card.id);
                const cardEl = global.CardUI && global.CardUI.createCardElement
                    ? global.CardUI.createCardElement(card, false, 'viewer-card') : null;
                if (cardEl) {
                    cardEl.style.pointerEvents = 'none';       // 点整格选中（卡面本身不响应 ✓）
                    cell.appendChild(cardEl);
                }
                // 攻防小字（方便一眼看清身材 ✓）
                const meta = document.createElement('div');
                meta.className = 'token-meta';
                const isMinionLike = (typeof card.attack === 'number') && (typeof card.defense === 'number');
                meta.textContent = isMinionLike ? ('⚔️' + card.attack + ' 🛡️' + card.defense) : '战术类衍生物';
                cell.appendChild(meta);
                g.appendChild(cell);
            });
            void cardDataOf;
        },

        select(cardId) {
            this.selectedId = cardId;
            this.renderGrid();
        },

        setCount(n) {
            const v = Math.max(1, Math.min(99, parseInt(n, 10) || 1));
            this.count = v;
            if (this.parts.count) this.parts.count.value = String(v);
        },

        confirm() {
            const card = this.cards.filter(c => c.id === this.selectedId)[0];
            if (!card) {
                if (global.UI) global.UI.showNotification('先选一张衍生物 ✓', 'warning');
                return false;
            }
            // ★加入手牌：直接生成 N 张到手牌（不进战场 ✓）
            if (this.mode === 'hand') {
                const res = (global.TokenManager && global.TokenManager.spawnToHand)
                    ? global.TokenManager.spawnToHand(card, 'self', this.count) : null;
                if (res && res.success) {
                    if (global.UI) global.UI.showNotification('已把 ' + res.count + ' 张「' + card.name + '」加入手牌 ✓', 'success');
                    this.close();
                    return true;
                }
                if (global.UI) global.UI.showNotification((res && res.error) || '加入手牌失败', 'warning');
                return false;
            }
            const ok = global.TokenPlacement && global.TokenPlacement.start(card, this.count);
            if (ok) this.close();
            return !!ok;
        }
    };

    global.TokenUI = TokenUI;
})(window);
