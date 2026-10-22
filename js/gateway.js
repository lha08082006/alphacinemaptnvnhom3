// js/gateway.js
'use strict';

(function() {
    window.togglePresenterPanel = function() {
        const panel = document.getElementById('presenter-panel');
        if (panel) {
            panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
        }
    };

    window.cancelTransaction = function() {
        if (confirm('Bạn có chắc chắn muốn hủy giao dịch thanh toán này?')) {
            if (window.currentTxn && typeof DB !== 'undefined') {
                window.currentTxn.status = 'CANCELLED';
                DB.update('gateway_txns', window.currentTxn.txnId, window.currentTxn);
            }
            if (window.spaNavigate) {
                window.spaNavigate('checkout');
            } else {
                window.location.hash = '#checkout';
            }
        }
    };

    window.submitGateway = function() {
        if (!window.currentTxn) return;

        const btn = document.getElementById('btn-submit');
        if (btn) btn.disabled = true;

        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'flex';

        const scenarioRadio = document.querySelector('input[name="scenario"]:checked');
        const scenario = scenarioRadio ? scenarioRadio.value : 'S1';
        let finalStatus = 'SUCCESS';
        let isDebited = true;
        let webhookMode = 'OK';

        switch (scenario) {
            case 'S1':
                finalStatus = 'SUCCESS';
                isDebited = true;
                webhookMode = 'OK';
                break;
            case 'S2':
                finalStatus = 'FAILED';
                isDebited = false;
                webhookMode = 'OK';
                break;
            case 'S3':
                finalStatus = 'CANCELLED';
                isDebited = false;
                webhookMode = 'OK';
                break;
            case 'S4':
                finalStatus = 'SUCCESS';
                isDebited = true;
                webhookMode = 'LOST';
                break;
            case 'S5':
                finalStatus = 'SUCCESS';
                isDebited = true;
                webhookMode = 'DELAYED';
                break;
        }

        setTimeout(() => {
            window.currentTxn.status = finalStatus;
            window.currentTxn.debited = isDebited;

            if (webhookMode === 'DELAYED') {
                window.currentTxn.callback = {
                    mode: 'DELAYED',
                    delayedUntil: ((typeof VirtualClock !== 'undefined') ? VirtualClock.now().getTime() : Date.now()) + 5 * 60000
                };
            } else if (webhookMode === 'LOST') {
                window.currentTxn.callback = { mode: 'LOST' };
            } else {
                window.currentTxn.callback = { mode: 'DONE' };
            }

            if (typeof DB !== 'undefined') {
                DB.update('gateway_txns', window.currentTxn.txnId, window.currentTxn);
                if (finalStatus === 'SUCCESS') {
                    DB.update('beta_orders', window.currentTxn.orderId, { status: 'PAID' });
                } else if (finalStatus === 'FAILED') {
                    DB.update('beta_orders', window.currentTxn.orderId, { status: 'FAILED' });
                } else if (finalStatus === 'CANCELLED') {
                    DB.update('beta_orders', window.currentTxn.orderId, { status: 'CANCELLED' });
                }
            }

            if (webhookMode === 'OK' && window.betaCore) {
                window.betaCore.receiveCallback({
                    txnId: window.currentTxn.txnId,
                    orderId: window.currentTxn.orderId,
                    amount: window.currentTxn.amount,
                    status: finalStatus
                });
            }

            const loaderText = document.getElementById('loader-text');
            if (loaderText) loaderText.innerText = 'Đang đưa bạn trở về Beta Cinemas...';

            setTimeout(() => {
                if (loader) loader.style.display = 'none';
                if (btn) btn.disabled = false;
                if (window.spaNavigate) {
                    window.spaNavigate('result', `orderId=${window.currentTxn.orderId}`);
                } else {
                    window.location.hash = `#result?orderId=${window.currentTxn.orderId}`;
                }
            }, 800);
        }, 1000);
    };
})();
