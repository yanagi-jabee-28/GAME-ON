/**
 * @file ui.js
 * @description UIの描画や更新を担当するファイル
 * HTML要素の操作はすべてここで行い、他のロジックから分離します。
 */

class UIManager {
    /**
     * UIManagerのコンストラクタ
     */
    constructor() {
        // UI要素を取得してプロパティに保持
        this.dateDisplay = document.getElementById('date-display');
        this.timeOfDayDisplay = document.getElementById('time-of-day-display');
        this.conditionDisplay = document.getElementById('condition-display');
        this.moneyDisplay = document.getElementById('money-display');
        this.cpDisplay = document.getElementById('cp-display');

        this.messageWindow = document.getElementById('message-window');
        this.characterName = document.getElementById('character-name');
        this.messageText = document.getElementById('message-text');
        this.clickIndicator = document.getElementById('click-indicator');

        this.choicesArea = document.getElementById('choices-area');

        // メニュー関連の要素
        this.menuButton = document.getElementById('menu-button');
        this.menuCloseButton = document.getElementById('menu-close-button');
        this.menuOverlay = document.getElementById('menu-overlay');
        this.menuAcademic = document.getElementById('menu-academic');
        this.menuCondition = document.getElementById('menu-condition');
        this.menuReportDebt = document.getElementById('menu-report-debt');
        this.menuItemList = document.getElementById('menu-item-list');
        this.menuCloseFloating = document.getElementById('menu-close-floating');

        // セーブ・ロード関連の要素
        this.saveGameButton = document.getElementById('save-game-button');
        this.loadGameButton = document.getElementById('load-game-button');
        this.loadGameFileInput = document.getElementById('load-game-file-input');

        // GameManager のステータス変更を購読して自動的に表示を更新
        if (typeof gameManager !== 'undefined' && typeof gameManager.subscribe === 'function') {
            gameManager.subscribe(status => {
                this.updateStatusDisplay(status);
                // メニューが開いている場合はメニューの内容も更新する
                if (this.menuOverlay && !this.menuOverlay.classList.contains('hidden')) {
                    this.updateMenuDisplay();
                }
            });
        }
    }

    /**
     * ステータス表示を更新する
     * @param {object} status - 表示するステータス情報 (GameManagerから取得)
     */
    updateStatusDisplay(status) {
        // 日付表示に曜日を付与
        const weekday = typeof gameManager.getWeekdayName === 'function' ? gameManager.getWeekdayName() : '';
        this.dateDisplay.textContent = `${status.day}日目 (${weekday}曜日)`;
        this.timeOfDayDisplay.textContent = CONFIG.TURNS[status.turnIndex];
        this.conditionDisplay.textContent = status.condition;
        this.moneyDisplay.textContent = `${status.money}G`;
        this.cpDisplay.textContent = status.cp;
    }

    /**
     * メッセージとキャラクター名を表示する
     * @param {string} text - 表示するメッセージ本文
     * @param {string} [characterName=''] - 表示するキャラクター名 (省略可能)
     */
    displayMessage(text, characterName = '') {
        // メニューが開いている場合はメッセージウィンドウを前面に出す
        if (this.menuOverlay && !this.menuOverlay.classList.contains('hidden')) {
            // 元の zIndex を保存しておく
            if (typeof this.messageWindow.dataset.origZ === 'undefined') {
                this.messageWindow.dataset.origZ = this.messageWindow.style.zIndex || '';
            }
            this.messageWindow.style.zIndex = 10001; // menuより前面
            // メッセージウィンドウが非表示になっている場合は表示する
            this.messageWindow.style.display = 'block';
        }

        this.characterName.textContent = characterName;
        this.messageText.textContent = text;
    }

    /**
     * メッセージをクリアする
     */
    clearMessage() {
        this.characterName.textContent = '';
        this.messageText.textContent = '';
        // 保存してあった zIndex を復元
        if (this.messageWindow && typeof this.messageWindow.dataset.origZ !== 'undefined') {
            this.messageWindow.style.zIndex = this.messageWindow.dataset.origZ || '';
            delete this.messageWindow.dataset.origZ;
        }
    }

    /**
     * ユーザーのクリックを待つ
     * @returns {Promise<void>} クリックされたら解決するPromise
     */
    waitForClick() {
        return new Promise(resolve => {
            // クリックインジケーターを表示
            this.clickIndicator.style.display = 'block';

            const listener = () => {
                // イベントリスナーを一度実行したら削除する
                this.messageWindow.removeEventListener('click', listener);
                // インジケーターを非表示にする
                this.clickIndicator.style.display = 'none';
                // クリック音を鳴らす（存在すれば）
                if (typeof soundManager !== 'undefined') soundManager.play('click');

                this.clearMessage(); // メッセージをクリア

                // Promiseを解決して、待機状態を終了する
                resolve();
            };

            // メッセージウィンドウにクリックイベントを設定
            this.messageWindow.addEventListener('click', listener);
        });
    }

    /**
     * 選択肢を表示する
     * @param {Array<object>} choices - 選択肢の配列。各オブジェクトは { text: '選択肢の文言', callback: 選択されたときの関数 } を持つ
     */
    displayChoices(choices) {
        // 既存の選択肢をクリア
        this.choicesArea.innerHTML = '';

        if (!choices || choices.length === 0) {
            return; // 選択肢がなければ何もしない
        }

        choices.forEach(choice => {
            const button = document.createElement('button');
            button.textContent = choice.text;
            button.className = 'choice-button';
            button.onclick = () => {
                // 効果音（存在すれば）
                if (typeof soundManager !== 'undefined') soundManager.play('click');
                // 選択肢をクリックしたら、選択履歴を記録
                try {
                    if (typeof gameManager !== 'undefined' && typeof gameManager.recordChoice === 'function') {
                        gameManager.recordChoice(choice.text);
                    }
                } catch (e) { console.error('recordChoice error', e); }

                // 先に既存の選択肢を消してからコールバックを実行する
                // これにより、コールバック内で新しい選択肢を表示しても
                // 直後に元のクリックハンドラがそれらを消してしまう問題を防ぐ
                this.clearChoices();

                try {
                    if (choice.callback) {
                        choice.callback();
                    }
                } catch (e) {
                    console.error('choice callback error', e);
                }
            };
            this.choicesArea.appendChild(button);
        });
    }

    /**
     * 選択肢を非表示にする
     */
    clearChoices() {
        this.choicesArea.innerHTML = '';
    }

    // --- メニュー関連のメソッド ---

    /**
     * メニューを開く
     */
    openMenu() {
        const status = gameManager.getStatus();
        if (status.menuLocked) return; // メニューがロックされているフェーズでは開けない
        // 自由行動時間のみメニューを開ける
        if (typeof GameEventManager === 'undefined' || !GameEventManager.isInFreeAction) {
            // ヒント表示: メニューは自由行動時間のみ開けます
            if (typeof this.displayMenuMessage === 'function') {
                this.displayMenuMessage('メニューは自由行動時間のみ開けます。');
                // 1.2秒後に消す
                setTimeout(() => this.clearMenuMessage(), 1200);
            }
            return;
        }

        this.menuOverlay.classList.remove('hidden');
        if (this.menuCloseFloating) this.menuCloseFloating.setAttribute('aria-visible', 'true');
        this.updateMenuDisplay(); // メニューを開く際に最新の情報を表示
    }

    /**
     * メニューを閉じる
     */
    closeMenu() {
        const status = gameManager.getStatus();
        this.menuOverlay.classList.add('hidden');
        if (this.menuCloseFloating) this.menuCloseFloating.setAttribute('aria-visible', 'false');
    }

    /**
     * メニューの表示内容を更新する
     */
    updateMenuDisplay() {
        const status = gameManager.getAllStatus(); // GameManagerから全ステータスを取得

        // ステータスセクションの更新
        this.menuAcademic.textContent = status.stats.academic;
        this.menuCondition.textContent = status.condition;
        this.menuReportDebt.textContent = status.reportDebt;

        // 個別レポートの表示（存在すれば）
        const reportListId = 'menu-report-list';
        let reportList = document.getElementById(reportListId);
        if (!reportList) {
            reportList = document.createElement('ul');
            reportList.id = reportListId;
            const section = document.getElementById('menu-status-section');
            if (section) section.appendChild(reportList);
        }
        reportList.innerHTML = '';
        if (status.reports && status.reports.length > 0) {
            status.reports.forEach(r => {
                const li = document.createElement('li');
                li.textContent = `${r.title} (${r.progress}/${r.required})`;
                reportList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = '進行中のレポートはありません。';
            reportList.appendChild(li);
        }

        // アイテムリストの更新
        this.menuItemList.innerHTML = ''; // 一度クリア
        if (status.items.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'アイテムはありません。';
            this.menuItemList.appendChild(li);
        } else {
            status.items.forEach(itemId => {
                const item = ITEMS[itemId]; // config.jsからアイテム情報を取得
                if (item) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${item.name} - ${item.description}</span>`;

                    // アイテム使用ボタンの追加
                    const useButton = document.createElement('button');
                    useButton.textContent = '使用';
                    useButton.onclick = async () => {
                        if (typeof gameManager === 'undefined') return;
                        // prevent double-trigger
                        if (useButton.disabled) return;
                        useButton.disabled = true;
                        try {
                            await gameManager.useItem(itemId);
                        } catch (e) {
                            console.error('useItem error', e);
                        } finally {
                            useButton.disabled = false;
                        }
                        // 使用後はメニュー表示を更新してメニューを閉じ、行動選択に戻す
                        try {
                            this.updateMenuDisplay();
                            this.closeMenu();
                            if (typeof GameEventManager !== 'undefined' && typeof GameEventManager.showMainActions === 'function') {
                                GameEventManager.showMainActions();
                            } else if (typeof ui !== 'undefined') {
                                ui.displayMessage('（アイテムを使用しました）');
                                if (typeof ui.waitForClick === 'function') await ui.waitForClick();
                                // 表示後の通常の選択肢に戻す
                                if (typeof GameEventManager !== 'undefined' && typeof GameEventManager.showMainActions === 'function') {
                                    GameEventManager.showMainActions();
                                }
                            }
                        } catch (e) {
                            console.error('Post-use UI update error', e);
                        }
                    };
                    li.appendChild(useButton);
                    this.menuItemList.appendChild(li);
                }
            });
        }
    }

    /**
     * メニュー内にメッセージを表示する（アイテム使用などで使う）
     * @param {string} text
     */
    displayMenuMessage(text) {
        const menuContent = document.getElementById('menu-content');
        if (!menuContent) return;
        let menuMsg = document.getElementById('menu-message');
        if (!menuMsg) {
            menuMsg = document.createElement('div');
            menuMsg.id = 'menu-message';
            menuMsg.className = 'menu-message';
            // メッセージはメニューの上部に表示
            menuContent.insertBefore(menuMsg, menuContent.firstChild);
        }
        menuMsg.textContent = text;
    }

    /**
     * メニュー内でのクリックを待つ
     * @returns {Promise<void>}
     */
    waitForMenuClick() {
        return new Promise(resolve => {
            // デフォルトはメニューのコンテンツ部分でのクリックを待つ
            const menuContent = document.getElementById('menu-content');
            if (!menuContent) return resolve();

            const listener = (e) => {
                // クリックが発生したらリスナーを解除して解決
                menuContent.removeEventListener('click', listener);
                // preventDefault や stopPropagation はここでは不要
                resolve();
            };

            menuContent.addEventListener('click', listener);
        });
    }

    /**
     * メニュー内メッセージをクリアする
     */
    clearMenuMessage() {
        const menuMsg = document.getElementById('menu-message');
        if (menuMsg) menuMsg.remove();
    }

    /**
     * メニューの上に重ねて表示するフローティングメッセージ
     * 複数行が与えられた場合は順に表示し、最後まで表示し終えたら自動で閉じる
     * @param {string} text
     * @param {{ lineDelay?: number }} [options]
     * @returns {Promise<void>}
     */
    async showFloatingMessage(text, options = {}) {
        const lines = ('' + text).split('\n');

        // 保持しておく既存のスタイル
        const origZ = this.messageWindow.style.zIndex;
        const origDisplay = this.messageWindow.style.display;

        try {
            // メッセージウィンドウを最前面に出す
            this.messageWindow.style.zIndex = 9999;
            this.messageWindow.style.display = 'block';

            for (const line of lines) {
                this.characterName.textContent = 'システム';
                this.messageText.textContent = line;
                // クリックインジケーターを表示して、ユーザークリックで次へ進める
                this.clickIndicator.style.display = 'block';

                // waitForClick はクリック時にメッセージをクリアするため、次行表示に自然につながる
                if (typeof this.waitForClick === 'function') {
                    await this.waitForClick();
                } else {
                    // フォールバック: クリック待ちが無ければ単純に1秒待つ
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        } finally {
            // 表示をクリアして元に戻す
            this.clearMessage();
            this.messageWindow.style.zIndex = origZ;
            this.messageWindow.style.display = origDisplay;
            // クリックインジケーターを非表示にしておく
            this.clickIndicator.style.display = 'none';
        }
    }

    /**
     * メニューボタンと閉じるボタンのイベントリスナーを設定する
     */
    initializeMenuListeners() {
        this.menuButton.addEventListener('click', () => this.openMenu());
        this.menuCloseButton.addEventListener('click', () => this.closeMenu());
        if (this.menuCloseFloating) this.menuCloseFloating.addEventListener('click', () => this.closeMenu());

        // セーブ・ロードボタンのイベントリスナー
        if (this.saveGameButton) {
            this.saveGameButton.addEventListener('click', () => this.handleSaveGame());
        }
        if (this.loadGameButton) {
            this.loadGameButton.addEventListener('click', () => this.loadGameFileInput && this.loadGameFileInput.click());
        }
        if (this.loadGameFileInput) {
            this.loadGameFileInput.addEventListener('change', (event) => this.handleLoadGame(event));
        }
    }

    /**
     * ゲームのセーブ処理
     */
    handleSaveGame() {
        if (typeof gameManager === 'undefined') return;
        const saveData = gameManager.getAllStatus(); // 全ステータスを取得
        const dataStr = JSON.stringify(saveData, null, 2); // 整形してJSON文字列に変換

        this.createDownloadLink(dataStr, 'game_save.json', 'application/json');
        this.displayMenuMessage('ゲームデータをセーブしました。ダウンロードリンクを確認してください。');
    }

    /**
     * ゲームのロード処理
     * @param {Event} event - ファイル入力のchangeイベント
     */
    handleLoadGame(event) {
        if (typeof gameManager === 'undefined') return;
        const file = event.target.files[0];
        if (!file) {
            this.displayMenuMessage('ファイルが選択されていません。');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedData = JSON.parse(e.target.result);
                gameManager.loadGame(loadedData); // GameManagerにロード処理を委譲
                this.displayMenuMessage('ゲームデータをロードしました。');
                this.closeMenu(); // メニューを閉じる
                GameEventManager.showMainActions(); // メインアクションに戻る
            } catch (error) {
                console.error('Failed to load game data:', error);
                this.displayMenuMessage('ゲームデータのロードに失敗しました。ファイルが破損しているか、形式が正しくありません。');
            }
        };
        reader.readAsText(file);
    }

    /**
     * ダウンロードリンクを生成し、ユーザーに提示する
     * @param {string} data - ダウンロードするデータ文字列
     * @param {string} filename - ファイル名
     * @param {string} type - MIMEタイプ
     */
    createDownloadLink(data, filename, type) {
        const blob = new Blob([data], { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.textContent = `セーブデータをダウンロード (${filename})`;
        a.style.display = 'block';
        a.style.marginTop = '10px';
        a.style.color = '#87CEEB';
        a.style.textDecoration = 'underline';

        const menuSaveLoadSection = document.getElementById('menu-save-load-section');
        if (menuSaveLoadSection) {
            // 既存のダウンロードリンクがあれば削除
            const existingLink = menuSaveLoadSection.querySelector('a[download]');
            if (existingLink) {
                existingLink.remove();
            }
            menuSaveLoadSection.appendChild(a);
        }

        // オブジェクトURLは不要になったら解放する
        a.addEventListener('click', () => {
            setTimeout(() => URL.revokeObjectURL(url), 100);
        });
    }
}