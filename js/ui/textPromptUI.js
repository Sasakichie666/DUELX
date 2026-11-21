// js/ui/textPromptUI.js
// ★统一的「文本输入」弹窗：替代浏览器自带的 window.prompt（那个太丑 ✗）
//
// 用法：TextPromptUI.ask({ title, label, value, placeholder, maxLength, onOk })
//   · onOk(text) 只在确认时回调；取消 / Esc / 点遮罩 = 不回调 ✓
//   · 样式复用大厅那套 .modal-mask / .modal（全站同款 ✓）

(function(global) {
    let modalEl = null;
    let parts = null;
    let onOkFn = null;

    function ensure() {
        if (modalEl && document.body.contains(modalEl)) return modalEl;
        const el = document.createElement('div');
        el.className = 'modal-mask no-blur';
        el.hidden = true;
        el.innerHTML = `
            <div class="modal modal-sm tp-modal" role="dialog" aria-modal="true">
                <header class="modal-head">
                    <h3 class="tp-title">输入</h3>
                    <button type="button" class="modal-close" data-act="cancel" aria-label="关闭">✕</button>
                </header>
                <div class="modal-sec">
                    <div class="modal-sec-title tp-label">名称</div>
                    <input type="text" class="tp-input" spellcheck="false" autocomplete="off">
                </div>
                <footer class="modal-foot">
                    <button type="button" class="btn" data-act="cancel">取消</button>
                    <button type="button" class="btn btn-success" data-act="ok">确定</button>
                </footer>
            </div>`;
        document.body.appendChild(el);
        modalEl = el;
        parts = {
            title: el.querySelector('.tp-title'),
            label: el.querySelector('.tp-label'),
            input: el.querySelector('.tp-input')
        };
        el.addEventListener('click', (e) => {
            if (e.target === el) { close(); return; }
            const btn = e.target.closest ? e.target.closest('[data-act]') : null;
            if (!btn || btn.tagName !== 'BUTTON') return;   // ★只认按钮（点输入框不关窗 ✓）
            if (btn.getAttribute('data-act') === 'ok') submit();
            else close();
        });
        parts.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        return el;
    }

    function close() {
        onOkFn = null;
        if (modalEl) modalEl.hidden = true;
    }

    function submit() {
        const text = String(parts.input.value || '').trim();
        if (!text) { try { parts.input.focus(); } catch (e) { } return; }
        const fn = onOkFn;
        close();
        if (typeof fn === 'function') fn(text);
    }

    /** @param {{title?:string,label?:string,value?:string,placeholder?:string,maxLength?:number,onOk:function}} opts */
    function ask(opts) {
        const o = opts || {};
        ensure();
        parts.title.textContent = o.title || '输入';
        parts.label.textContent = o.label || '名称';
        parts.input.value = o.value === undefined || o.value === null ? '' : String(o.value);
        parts.input.placeholder = o.placeholder || '';
        parts.input.maxLength = o.maxLength || 20;
        onOkFn = typeof o.onOk === 'function' ? o.onOk : null;
        modalEl.hidden = false;
        setTimeout(() => {
            try { parts.input.focus(); parts.input.select(); } catch (e) { }
        }, 30);
        return true;
    }

    global.TextPromptUI = { ask, close };
})(window);
