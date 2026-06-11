(function () {
    "use strict";

    var CATEGORY_ORDER = ["排序", "查找", "线性结构", "树", "图", "散列表", "堆"];
    var MAX_ARRAY_ITEMS = 16;

    var refs = {};
    var selectedCategory = "排序";
    var selectedAlgorithmId = "bubble-sort";
    var steps = [];
    var currentStep = 0;
    var playerTimer = null;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function compactValue(value) {
        if (Array.isArray(value)) {
            return "[" + value.join(", ") + "]";
        }
        if (value && typeof value === "object") {
            return Object.keys(value).map(function (key) {
                return key + ":" + value[key];
            }).join(", ");
        }
        if (value === Infinity) {
            return "∞";
        }
        return value === undefined || value === null || value === "" ? "-" : String(value);
    }

    function makeStep(options) {
        return Object.assign({
            kind: "array",
            viewLabel: "数组视图",
            phase: "执行中",
            title: "",
            description: "",
            codeLine: 1,
            state: {},
            status: {},
            pointers: {},
        }, options);
    }

    function parseNumbers(raw, fallback) {
        var source = (raw || "").trim();
        var tokens;

        if (!source) {
            return fallback.slice(0, MAX_ARRAY_ITEMS);
        }

        try {
            var parsed = JSON.parse(source);
            if (Array.isArray(parsed)) {
                tokens = parsed;
            }
        } catch (error) {
            tokens = null;
        }

        if (!tokens) {
            tokens = source.split(/[\s,，;；]+/).filter(Boolean);
        }

        var numbers = tokens
            .map(function (item) {
                return Number(item);
            })
            .filter(function (item) {
                return Number.isFinite(item);
            })
            .map(function (item) {
                return Math.round(item);
            })
            .slice(0, MAX_ARRAY_ITEMS);

        return numbers.length ? numbers : fallback.slice(0, MAX_ARRAY_ITEMS);
    }

    function parseTokens(raw, fallback) {
        var source = (raw || "").trim();
        if (!source) {
            return fallback.slice();
        }
        var tokens = source
            .replace(/^\[/, "")
            .replace(/\]$/, "")
            .split(/[\s,，;；]+/)
            .map(function (item) {
                return item.trim();
            })
            .filter(Boolean)
            .slice(0, 18);
        return tokens.length ? tokens : fallback.slice();
    }

    function parseTarget(raw, fallback) {
        var value = (raw || "").trim();
        return value || fallback || "";
    }

    function parseNumericTarget(raw, fallback) {
        var value = Number((raw || "").trim());
        return Number.isFinite(value) ? Math.round(value) : fallback;
    }

    function rangeStatus(length, low, high, activeIndex, foundIndex) {
        var status = {};
        for (var i = 0; i < length; i += 1) {
            if (i < low || i > high) {
                status[i] = "discarded";
            }
        }
        if (Number.isInteger(activeIndex)) {
            status[activeIndex] = foundIndex === activeIndex ? "found" : "active";
        }
        if (Number.isInteger(foundIndex)) {
            status[foundIndex] = "found";
        }
        return status;
    }

    function statusFor(indices, className, base) {
        var status = Object.assign({}, base || {});
        indices.forEach(function (index) {
            status[index] = status[index] ? status[index] + " " + className : className;
        });
        return status;
    }

    function sortedBase(length, sortedSet) {
        var status = {};
        sortedSet.forEach(function (index) {
            if (index >= 0 && index < length) {
                status[index] = "sorted";
            }
        });
        return status;
    }

    function arrayStep(array, options) {
        return makeStep(Object.assign({
            kind: "array",
            viewLabel: "数组视图",
            array: array.slice(),
        }, options));
    }

    function buildBubbleSteps(input) {
        var arr = input.values.slice();
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "读取用户数据，准备从左到右比较相邻元素。",
                codeLine: 1,
                state: { n: arr.length },
            }),
        ];
        var sorted = new Set();

        for (var i = 0; i < arr.length - 1; i += 1) {
            for (var j = 0; j < arr.length - i - 1; j += 1) {
                result.push(arrayStep(arr, {
                    phase: "比较",
                    description: "比较 a[" + j + "]=" + arr[j] + " 与 a[" + (j + 1) + "]=" + arr[j + 1] + "。",
                    codeLine: 3,
                    status: statusFor([j, j + 1], "compare", sortedBase(arr.length, sorted)),
                    pointers: Object.assign({}, { i: arr.length - i - 1, j: j }),
                    state: { i: i, j: j, left: arr[j], right: arr[j + 1] },
                }));
                if (arr[j] > arr[j + 1]) {
                    var temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    result.push(arrayStep(arr, {
                        phase: "交换",
                        description: "左侧元素更大，交换这两个位置。",
                        codeLine: 4,
                        status: statusFor([j, j + 1], "swap", sortedBase(arr.length, sorted)),
                        pointers: { j: j, "j+1": j + 1 },
                        state: { i: i, j: j, swaps: 1 },
                    }));
                }
            }
            sorted.add(arr.length - i - 1);
            result.push(arrayStep(arr, {
                phase: "锁定",
                description: "本轮最大值已经浮到右侧有序区。",
                codeLine: 5,
                status: sortedBase(arr.length, sorted),
                state: { sorted: Array.from(sorted).sort(function (a, b) { return a - b; }) },
            }));
        }
        sorted.add(0);
        result.push(arrayStep(arr, {
            phase: "完成",
            description: "所有元素已经按升序排列。",
            codeLine: 5,
            status: sortedBase(arr.length, sorted),
            state: { result: arr },
        }));
        return result;
    }

    function buildSelectionSteps(input) {
        var arr = input.values.slice();
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "每轮从无序区选择最小值，放到左侧边界。",
                codeLine: 1,
                state: { n: arr.length },
            }),
        ];
        var sorted = new Set();

        for (var i = 0; i < arr.length - 1; i += 1) {
            var minIndex = i;
            result.push(arrayStep(arr, {
                phase: "选择",
                description: "假设当前位置 a[" + i + "] 是本轮最小值。",
                codeLine: 2,
                status: statusFor([minIndex], "active", sortedBase(arr.length, sorted)),
                pointers: { min: minIndex, i: i },
                state: { i: i, min: minIndex },
            }));
            for (var j = i + 1; j < arr.length; j += 1) {
                result.push(arrayStep(arr, {
                    phase: "扫描",
                    description: "比较候选最小值 " + arr[minIndex] + " 与 a[" + j + "]=" + arr[j] + "。",
                    codeLine: 4,
                    status: statusFor([minIndex, j], "compare", sortedBase(arr.length, sorted)),
                    pointers: { min: minIndex, j: j },
                    state: { i: i, j: j, min: minIndex },
                }));
                if (arr[j] < arr[minIndex]) {
                    minIndex = j;
                    result.push(arrayStep(arr, {
                        phase: "更新",
                        description: "发现更小的元素，更新 min 指针。",
                        codeLine: 5,
                        status: statusFor([minIndex], "active", sortedBase(arr.length, sorted)),
                        pointers: { min: minIndex },
                        state: { i: i, min: minIndex },
                    }));
                }
            }
            if (minIndex !== i) {
                var temp = arr[i];
                arr[i] = arr[minIndex];
                arr[minIndex] = temp;
                result.push(arrayStep(arr, {
                    phase: "交换",
                    description: "把本轮最小值放入左侧有序区。",
                    codeLine: 6,
                    status: statusFor([i, minIndex], "swap", sortedBase(arr.length, sorted)),
                    pointers: { i: i, min: minIndex },
                    state: { i: i, min: minIndex },
                }));
            }
            sorted.add(i);
            result.push(arrayStep(arr, {
                phase: "锁定",
                description: "左侧有序区扩大一位。",
                codeLine: 7,
                status: sortedBase(arr.length, sorted),
                state: { sorted: Array.from(sorted).sort(function (a, b) { return a - b; }) },
            }));
        }
        for (var k = 0; k < arr.length; k += 1) {
            sorted.add(k);
        }
        result.push(arrayStep(arr, {
            phase: "完成",
            description: "选择排序结束。",
            codeLine: 7,
            status: sortedBase(arr.length, sorted),
            state: { result: arr },
        }));
        return result;
    }

    function buildInsertionSteps(input) {
        var arr = input.values.slice();
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "从第二个元素开始，将当前元素插入左侧有序区。",
                codeLine: 1,
                status: { 0: "sorted" },
                state: { n: arr.length },
            }),
        ];

        for (var i = 1; i < arr.length; i += 1) {
            var key = arr[i];
            var j = i - 1;
            result.push(arrayStep(arr, {
                phase: "取出",
                description: "取出 key=" + key + "，准备向左寻找插入位置。",
                codeLine: 2,
                status: statusFor([i], "active"),
                pointers: { key: i },
                state: { i: i, key: key },
            }));
            while (j >= 0 && arr[j] > key) {
                result.push(arrayStep(arr, {
                    phase: "比较",
                    description: "a[" + j + "]=" + arr[j] + " 大于 key，右移该元素。",
                    codeLine: 4,
                    status: statusFor([j, j + 1], "compare"),
                    pointers: { j: j, key: j + 1 },
                    state: { j: j, key: key },
                }));
                arr[j + 1] = arr[j];
                result.push(arrayStep(arr, {
                    phase: "右移",
                    description: "为 key 腾出插入空间。",
                    codeLine: 5,
                    status: statusFor([j + 1], "move"),
                    pointers: { j: j, key: j + 1 },
                    state: { shifted: arr[j + 1], key: key },
                }));
                j -= 1;
            }
            arr[j + 1] = key;
            var status = {};
            for (var sorted = 0; sorted <= i; sorted += 1) {
                status[sorted] = "sorted";
            }
            status[j + 1] = "active";
            result.push(arrayStep(arr, {
                phase: "插入",
                description: "将 key 放入最终位置。",
                codeLine: 6,
                status: status,
                pointers: { key: j + 1 },
                state: { insertIndex: j + 1, key: key },
            }));
        }

        var doneStatus = {};
        for (var d = 0; d < arr.length; d += 1) {
            doneStatus[d] = "sorted";
        }
        result.push(arrayStep(arr, {
            phase: "完成",
            description: "插入排序结束。",
            codeLine: 6,
            status: doneStatus,
            state: { result: arr },
        }));
        return result;
    }

    function buildQuickSteps(input) {
        var arr = input.values.slice();
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "选择区间右端作为 pivot，递归划分左右区间。",
                codeLine: 1,
                state: { n: arr.length },
            }),
        ];

        function partition(low, high) {
            var pivot = arr[high];
            var i = low - 1;
            result.push(arrayStep(arr, {
                phase: "选 pivot",
                description: "在区间 [" + low + ", " + high + "] 中选择 pivot=" + pivot + "。",
                codeLine: 2,
                status: statusFor([high], "pivot"),
                pointers: { pivot: high, low: low, high: high },
                state: { low: low, high: high, pivot: pivot },
            }));

            for (var j = low; j < high; j += 1) {
                result.push(arrayStep(arr, {
                    phase: "分区",
                    description: "检查 a[" + j + "] 是否小于等于 pivot。",
                    codeLine: 4,
                    status: statusFor([j, high], "compare", statusFor([high], "pivot")),
                    pointers: { i: i, j: j, pivot: high },
                    state: { low: low, high: high, i: i, j: j, pivot: pivot },
                }));
                if (arr[j] <= pivot) {
                    i += 1;
                    var temp = arr[i];
                    arr[i] = arr[j];
                    arr[j] = temp;
                    result.push(arrayStep(arr, {
                        phase: "交换",
                        description: "把不大于 pivot 的元素移动到左侧。",
                        codeLine: 6,
                        status: statusFor([i, j], "swap", statusFor([high], "pivot")),
                        pointers: { i: i, j: j, pivot: high },
                        state: { i: i, j: j, pivot: pivot },
                    }));
                }
            }

            var pivotIndex = i + 1;
            var tempPivot = arr[pivotIndex];
            arr[pivotIndex] = arr[high];
            arr[high] = tempPivot;
            result.push(arrayStep(arr, {
                phase: "归位",
                description: "pivot 归位，左侧不大于它，右侧不小于它。",
                codeLine: 7,
                status: statusFor([pivotIndex], "sorted"),
                pointers: { pivot: pivotIndex },
                state: { pivotIndex: pivotIndex, pivot: arr[pivotIndex] },
            }));
            return pivotIndex;
        }

        function quickSort(low, high) {
            if (low < high) {
                var p = partition(low, high);
                quickSort(low, p - 1);
                quickSort(p + 1, high);
            } else if (low === high) {
                result.push(arrayStep(arr, {
                    phase: "单点区间",
                    description: "单个元素天然有序。",
                    codeLine: 1,
                    status: statusFor([low], "sorted"),
                    state: { index: low },
                }));
            }
        }

        quickSort(0, arr.length - 1);
        var finalStatus = {};
        for (var i = 0; i < arr.length; i += 1) {
            finalStatus[i] = "sorted";
        }
        result.push(arrayStep(arr, {
            phase: "完成",
            description: "快速排序结束。",
            codeLine: 1,
            status: finalStatus,
            state: { result: arr },
        }));
        return result;
    }

    function buildMergeSteps(input) {
        var arr = input.values.slice();
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "递归拆分数组，再按有序片段合并。",
                codeLine: 1,
                state: { n: arr.length },
            }),
        ];

        function mergeSort(left, right) {
            if (left >= right) {
                return;
            }
            var mid = Math.floor((left + right) / 2);
            result.push(arrayStep(arr, {
                phase: "拆分",
                description: "将区间 [" + left + ", " + right + "] 拆成 [" + left + ", " + mid + "] 和 [" + (mid + 1) + ", " + right + "]。",
                codeLine: 2,
                status: statusFor([left, mid, right], "active"),
                pointers: { left: left, mid: mid, right: right },
                state: { left: left, mid: mid, right: right },
            }));
            mergeSort(left, mid);
            mergeSort(mid + 1, right);

            var leftPart = arr.slice(left, mid + 1);
            var rightPart = arr.slice(mid + 1, right + 1);
            var i = 0;
            var j = 0;
            var k = left;
            while (i < leftPart.length && j < rightPart.length) {
                result.push(arrayStep(arr, {
                    phase: "比较",
                    description: "比较左片段 " + leftPart[i] + " 与右片段 " + rightPart[j] + "。",
                    codeLine: 5,
                    status: statusFor([left + i, mid + 1 + j], "compare"),
                    pointers: { L: left + i, R: mid + 1 + j, k: k },
                    state: { leftValue: leftPart[i], rightValue: rightPart[j], writeIndex: k },
                }));
                if (leftPart[i] <= rightPart[j]) {
                    arr[k] = leftPart[i];
                    i += 1;
                } else {
                    arr[k] = rightPart[j];
                    j += 1;
                }
                result.push(arrayStep(arr, {
                    phase: "写入",
                    description: "把较小值写回 a[" + k + "]。",
                    codeLine: 6,
                    status: statusFor([k], "move"),
                    pointers: { k: k },
                    state: { writeIndex: k, current: arr[k] },
                }));
                k += 1;
            }
            while (i < leftPart.length) {
                arr[k] = leftPart[i];
                result.push(arrayStep(arr, {
                    phase: "收尾",
                    description: "左片段还有剩余元素，继续写回。",
                    codeLine: 7,
                    status: statusFor([k], "move"),
                    pointers: { k: k },
                    state: { writeIndex: k, current: arr[k] },
                }));
                i += 1;
                k += 1;
            }
            while (j < rightPart.length) {
                arr[k] = rightPart[j];
                result.push(arrayStep(arr, {
                    phase: "收尾",
                    description: "右片段还有剩余元素，继续写回。",
                    codeLine: 7,
                    status: statusFor([k], "move"),
                    pointers: { k: k },
                    state: { writeIndex: k, current: arr[k] },
                }));
                j += 1;
                k += 1;
            }
        }

        mergeSort(0, arr.length - 1);
        var status = {};
        for (var s = 0; s < arr.length; s += 1) {
            status[s] = "sorted";
        }
        result.push(arrayStep(arr, {
            phase: "完成",
            description: "归并排序结束。",
            codeLine: 7,
            status: status,
            state: { result: arr },
        }));
        return result;
    }

    function buildLinearSearchSteps(input) {
        var arr = input.values.slice();
        var target = input.numericTarget;
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "从左到右逐个检查元素。",
                codeLine: 1,
                state: { target: target, n: arr.length },
            }),
        ];

        for (var i = 0; i < arr.length; i += 1) {
            var found = arr[i] === target;
            var base = {};
            for (var d = 0; d < i; d += 1) {
                base[d] = "discarded";
            }
            result.push(arrayStep(arr, {
                phase: found ? "命中" : "检查",
                description: found ? "a[" + i + "] 等于目标值，查找成功。" : "a[" + i + "] 不等于目标值，继续向右。",
                codeLine: found ? 3 : 2,
                status: statusFor([i], found ? "found" : "compare", base),
                pointers: { i: i },
                state: { i: i, current: arr[i], target: target },
            }));
            if (found) {
                return result;
            }
        }
        var status = {};
        for (var x = 0; x < arr.length; x += 1) {
            status[x] = "discarded";
        }
        result.push(arrayStep(arr, {
            phase: "未找到",
            description: "扫描完整个数组，未发现目标值。",
            codeLine: 4,
            status: status,
            state: { target: target, result: -1 },
        }));
        return result;
    }

    function buildBinarySearchSteps(input) {
        var arr = input.values.slice().sort(function (a, b) { return a - b; });
        var target = input.numericTarget;
        var result = [
            arrayStep(arr, {
                phase: "初始化",
                description: "二分查找要求数组有序，当前视图已按升序排列。",
                codeLine: 1,
                state: { target: target, low: 0, high: arr.length - 1 },
            }),
        ];
        var low = 0;
        var high = arr.length - 1;

        while (low <= high) {
            var mid = Math.floor((low + high) / 2);
            result.push(arrayStep(arr, {
                phase: "取中点",
                description: "检查中点 a[" + mid + "]=" + arr[mid] + "。",
                codeLine: 2,
                status: rangeStatus(arr.length, low, high, mid),
                pointers: { low: low, mid: mid, high: high },
                state: { low: low, mid: mid, high: high, target: target },
            }));
            if (arr[mid] === target) {
                result.push(arrayStep(arr, {
                    phase: "命中",
                    description: "中点值等于目标，查找成功。",
                    codeLine: 4,
                    status: rangeStatus(arr.length, low, high, mid, mid),
                    pointers: { mid: mid },
                    state: { index: mid, target: target },
                }));
                return result;
            }
            if (arr[mid] < target) {
                low = mid + 1;
                result.push(arrayStep(arr, {
                    phase: "缩小区间",
                    description: "中点值小于目标，舍弃左半区间。",
                    codeLine: 6,
                    status: rangeStatus(arr.length, low, high),
                    pointers: { low: low, high: high },
                    state: { low: low, high: high, target: target },
                }));
            } else {
                high = mid - 1;
                result.push(arrayStep(arr, {
                    phase: "缩小区间",
                    description: "中点值大于目标，舍弃右半区间。",
                    codeLine: 7,
                    status: rangeStatus(arr.length, low, high),
                    pointers: { low: low, high: high },
                    state: { low: low, high: high, target: target },
                }));
            }
        }
        result.push(arrayStep(arr, {
            phase: "未找到",
            description: "查找区间为空，目标不存在。",
            codeLine: 8,
            status: rangeStatus(arr.length, low, high),
            state: { target: target, result: -1 },
        }));
        return result;
    }

    function buildStackSteps(input) {
        var values = input.tokens;
        var stack = [];
        var result = [
            makeStep({
                kind: "stack",
                viewLabel: "栈视图",
                phase: "初始化",
                values: stack.slice(),
                description: "栈从底部向顶部增长。",
                codeLine: 1,
                state: { top: "-", size: 0 },
            }),
        ];

        values.forEach(function (value) {
            stack.push(value);
            result.push(makeStep({
                kind: "stack",
                viewLabel: "栈视图",
                phase: "push",
                values: stack.slice(),
                activeIndex: stack.length - 1,
                description: "push(" + value + ")，新元素成为栈顶。",
                codeLine: 2,
                state: { operation: "push", value: value, top: stack.length - 1, size: stack.length },
            }));
        });

        if (stack.length) {
            var top = stack.pop();
            result.push(makeStep({
                kind: "stack",
                viewLabel: "栈视图",
                phase: "pop",
                values: stack.slice(),
                popped: top,
                description: "pop() 移除原栈顶 " + top + "。",
                codeLine: 4,
                state: { operation: "pop", value: top, top: stack.length - 1, size: stack.length },
            }));
        }
        return result;
    }

    function buildQueueSteps(input) {
        var values = input.tokens;
        var queue = [];
        var result = [
            makeStep({
                kind: "queue",
                viewLabel: "队列视图",
                phase: "初始化",
                values: queue.slice(),
                description: "队列从队尾入队，从队头出队。",
                codeLine: 1,
                state: { front: "-", rear: "-", size: 0 },
            }),
        ];

        values.forEach(function (value) {
            queue.push(value);
            result.push(makeStep({
                kind: "queue",
                viewLabel: "队列视图",
                phase: "enqueue",
                values: queue.slice(),
                activeIndex: queue.length - 1,
                description: "enqueue(" + value + ")，元素进入队尾。",
                codeLine: 2,
                state: { operation: "enqueue", value: value, front: 0, rear: queue.length - 1, size: queue.length },
            }));
        });

        if (queue.length) {
            var front = queue.shift();
            result.push(makeStep({
                kind: "queue",
                viewLabel: "队列视图",
                phase: "dequeue",
                values: queue.slice(),
                description: "dequeue() 移除原队头 " + front + "。",
                codeLine: 4,
                state: { operation: "dequeue", value: front, front: queue.length ? 0 : "-", rear: queue.length - 1, size: queue.length },
            }));
        }
        return result;
    }

    function parseLinkedCommand(raw, values) {
        var text = parseTarget(raw, "insert:7@2");
        var insertMatch = text.match(/(?:insert|add|插入)\s*[:：]\s*([^@\s]+)(?:@(\d+))?/i);
        var deleteMatch = text.match(/(?:delete|remove|删除)\s*[:：]\s*([^@\s]+)/i);
        if (deleteMatch) {
            return { type: "delete", value: deleteMatch[1] };
        }
        if (insertMatch) {
            return { type: "insert", value: insertMatch[1], index: clamp(Number(insertMatch[2] || values.length), 0, values.length) };
        }
        return { type: "insert", value: text, index: values.length };
    }

    function buildLinkedListSteps(input) {
        var values = input.tokens.slice(0, 12);
        var command = parseLinkedCommand(input.target, values);
        var result = [
            makeStep({
                kind: "linked",
                viewLabel: "链表视图",
                phase: "初始化",
                values: values.slice(),
                description: "单链表通过 next 指针串联节点。",
                codeLine: 1,
                state: { length: values.length, command: command.type },
            }),
        ];

        if (command.type === "delete") {
            for (var i = 0; i < values.length; i += 1) {
                result.push(makeStep({
                    kind: "linked",
                    viewLabel: "链表视图",
                    phase: "查找",
                    values: values.slice(),
                    activeIndex: i,
                    targetIndex: i,
                    description: "检查节点 " + values[i] + " 是否为删除目标。",
                    codeLine: 2,
                    state: { current: values[i], target: command.value, index: i },
                }));
                if (String(values[i]) === String(command.value)) {
                    values.splice(i, 1);
                    result.push(makeStep({
                        kind: "linked",
                        viewLabel: "链表视图",
                        phase: "删除",
                        values: values.slice(),
                        activeIndex: Math.min(i, values.length - 1),
                        description: "重连前驱节点的 next，删除目标节点。",
                        codeLine: 4,
                        state: { deleted: command.value, length: values.length },
                    }));
                    return result;
                }
            }
            result.push(makeStep({
                kind: "linked",
                viewLabel: "链表视图",
                phase: "未找到",
                values: values.slice(),
                description: "链表中没有匹配的节点。",
                codeLine: 5,
                state: { target: command.value, result: "not found" },
            }));
            return result;
        }

        for (var j = 0; j < command.index; j += 1) {
            result.push(makeStep({
                kind: "linked",
                viewLabel: "链表视图",
                phase: "定位",
                values: values.slice(),
                activeIndex: j,
                description: "沿 next 指针移动到插入位置的前驱附近。",
                codeLine: 2,
                state: { currentIndex: j, insertIndex: command.index },
            }));
        }
        values.splice(command.index, 0, command.value);
        result.push(makeStep({
            kind: "linked",
            viewLabel: "链表视图",
            phase: "插入",
            values: values.slice(),
            activeIndex: command.index,
            description: "更新新节点与相邻节点的 next 指针，插入完成。",
            codeLine: 4,
            state: { inserted: command.value, index: command.index, length: values.length },
        }));
        return result;
    }

    function treeNode(value) {
        return { value: value, left: null, right: null };
    }

    function insertTreeValue(root, value) {
        if (!root) {
            return treeNode(value);
        }
        var current = root;
        while (current) {
            if (value === current.value) {
                return root;
            }
            if (value < current.value) {
                if (!current.left) {
                    current.left = treeNode(value);
                    return root;
                }
                current = current.left;
            } else {
                if (!current.right) {
                    current.right = treeNode(value);
                    return root;
                }
                current = current.right;
            }
        }
        return root;
    }

    function buildBstSteps(input) {
        var values = input.values.slice(0, 11);
        var target = input.numericTarget;
        var root = null;
        var result = [
            makeStep({
                kind: "tree",
                viewLabel: "树视图",
                phase: "初始化",
                tree: null,
                description: "二叉搜索树满足左子树小、右子树大。",
                codeLine: 1,
                state: { count: 0 },
            }),
        ];

        values.forEach(function (value) {
            if (!root) {
                root = treeNode(value);
                result.push(makeStep({
                    kind: "tree",
                    viewLabel: "树视图",
                    phase: "插入根",
                    tree: clone(root),
                    activeValues: [value],
                    description: "树为空，" + value + " 成为根节点。",
                    codeLine: 2,
                    state: { inserted: value, root: value },
                }));
                return;
            }

            var current = root;
            while (current) {
                result.push(makeStep({
                    kind: "tree",
                    viewLabel: "树视图",
                    phase: "比较",
                    tree: clone(root),
                    activeValues: [current.value],
                    targetValues: [value],
                    description: value + " 与当前节点 " + current.value + " 比较。",
                    codeLine: 3,
                    state: { value: value, current: current.value },
                }));
                if (value === current.value) {
                    result.push(makeStep({
                        kind: "tree",
                        viewLabel: "树视图",
                        phase: "跳过重复",
                        tree: clone(root),
                        activeValues: [current.value],
                        description: "该值已存在，不重复插入。",
                        codeLine: 6,
                        state: { skipped: value },
                    }));
                    return;
                }
                if (value < current.value) {
                    if (!current.left) {
                        current.left = treeNode(value);
                        break;
                    }
                    current = current.left;
                } else {
                    if (!current.right) {
                        current.right = treeNode(value);
                        break;
                    }
                    current = current.right;
                }
            }
            result.push(makeStep({
                kind: "tree",
                viewLabel: "树视图",
                phase: "插入",
                tree: clone(root),
                activeValues: [value],
                description: value + " 插入到搜索路径末端。",
                codeLine: 5,
                state: { inserted: value },
            }));
        });

        var search = root;
        while (search) {
            result.push(makeStep({
                kind: "tree",
                viewLabel: "树视图",
                phase: "查找",
                tree: clone(root),
                activeValues: [search.value],
                targetValues: [target],
                description: "查找目标 " + target + "，当前节点为 " + search.value + "。",
                codeLine: 7,
                state: { target: target, current: search.value },
            }));
            if (search.value === target) {
                result.push(makeStep({
                    kind: "tree",
                    viewLabel: "树视图",
                    phase: "命中",
                    tree: clone(root),
                    foundValues: [target],
                    description: "目标值位于当前节点。",
                    codeLine: 8,
                    state: { target: target, result: "found" },
                }));
                return result;
            }
            search = target < search.value ? search.left : search.right;
        }

        result.push(makeStep({
            kind: "tree",
            viewLabel: "树视图",
            phase: "未找到",
            tree: clone(root),
            description: "搜索路径结束，树中不存在目标值。",
            codeLine: 9,
            state: { target: target, result: "not found" },
        }));
        return result;
    }

    function parseGraph(raw, fallback) {
        var source = (raw || fallback).trim();
        var parts = source.split(/[\n;；]+|，|,(?=\s*[A-Za-z0-9_\u4e00-\u9fa5]+\s*(?:-|->))/).map(function (item) {
            return item.trim();
        }).filter(Boolean);
        var edges = [];
        var nodeSet = new Set();

        parts.forEach(function (part) {
            var match = part.match(/^([A-Za-z0-9_\u4e00-\u9fa5]+)\s*(?:->|-)\s*([A-Za-z0-9_\u4e00-\u9fa5]+)(?:\s*[:：=]\s*(-?\d+))?$/);
            if (!match) {
                return;
            }
            var from = match[1];
            var to = match[2];
            var weight = Number(match[3] || 1);
            nodeSet.add(from);
            nodeSet.add(to);
            edges.push({ from: from, to: to, weight: Number.isFinite(weight) ? weight : 1 });
        });

        if (!edges.length) {
            return parseGraph(fallback, fallback);
        }

        var nodes = Array.from(nodeSet).sort();
        return {
            nodes: nodes.slice(0, 9),
            edges: edges.filter(function (edge) {
                return nodes.indexOf(edge.from) !== -1 && nodes.indexOf(edge.to) !== -1;
            }).slice(0, 22),
        };
    }

    function adjacencyFromGraph(graph, weighted) {
        var adjacency = {};
        graph.nodes.forEach(function (node) {
            adjacency[node] = [];
        });
        graph.edges.forEach(function (edge) {
            adjacency[edge.from].push({ node: edge.to, weight: edge.weight });
            adjacency[edge.to].push({ node: edge.from, weight: edge.weight });
        });
        Object.keys(adjacency).forEach(function (node) {
            adjacency[node].sort(function (a, b) {
                return a.node.localeCompare(b.node);
            });
            if (!weighted) {
                adjacency[node] = adjacency[node].map(function (item) {
                    return { node: item.node, weight: 1 };
                });
            }
        });
        return adjacency;
    }

    function parseRoute(raw, fallbackStart, fallbackGoal) {
        var text = parseTarget(raw, fallbackStart + "->" + fallbackGoal);
        var match = text.match(/^([A-Za-z0-9_\u4e00-\u9fa5]+)(?:\s*->\s*([A-Za-z0-9_\u4e00-\u9fa5]+))?$/);
        if (!match) {
            return { start: fallbackStart, goal: fallbackGoal };
        }
        return { start: match[1], goal: match[2] || fallbackGoal };
    }

    function graphStep(graph, options) {
        return makeStep(Object.assign({
            kind: "graph",
            viewLabel: "图视图",
            graph: clone(graph),
            visited: [],
            activeNodes: [],
            foundNodes: [],
            activeEdges: [],
        }, options));
    }

    function buildBfsSteps(input) {
        var graph = input.graph;
        var route = parseRoute(input.target, graph.nodes[0], graph.nodes[graph.nodes.length - 1]);
        var adjacency = adjacencyFromGraph(graph, false);
        var start = graph.nodes.indexOf(route.start) === -1 ? graph.nodes[0] : route.start;
        var goal = graph.nodes.indexOf(route.goal) === -1 ? graph.nodes[graph.nodes.length - 1] : route.goal;
        var queue = [start];
        var visited = new Set([start]);
        var parent = {};
        var result = [
            graphStep(graph, {
                phase: "初始化",
                visited: Array.from(visited),
                activeNodes: [start],
                description: "从起点 " + start + " 开始，将它入队。",
                codeLine: 1,
                state: { start: start, goal: goal, queue: queue.slice() },
            }),
        ];

        while (queue.length) {
            var current = queue.shift();
            result.push(graphStep(graph, {
                phase: "出队",
                visited: Array.from(visited),
                activeNodes: [current],
                description: "访问队头节点 " + current + "。",
                codeLine: 3,
                state: { current: current, queue: queue.slice() },
            }));
            if (current === goal) {
                result.push(graphStep(graph, {
                    phase: "命中",
                    visited: Array.from(visited),
                    foundNodes: [goal],
                    activeEdges: buildPathEdges(parent, start, goal),
                    description: "BFS 首次到达目标，得到最短边数路径。",
                    codeLine: 4,
                    state: { goal: goal, path: buildPath(parent, start, goal) },
                }));
                return result;
            }
            adjacency[current].forEach(function (neighbor) {
                if (visited.has(neighbor.node)) {
                    return;
                }
                visited.add(neighbor.node);
                parent[neighbor.node] = current;
                queue.push(neighbor.node);
                result.push(graphStep(graph, {
                    phase: "扩展",
                    visited: Array.from(visited),
                    activeNodes: [neighbor.node],
                    activeEdges: [edgeKey(current, neighbor.node)],
                    description: "发现未访问邻接点 " + neighbor.node + "，记录前驱并入队。",
                    codeLine: 6,
                    state: { current: current, enqueue: neighbor.node, queue: queue.slice() },
                }));
            });
        }

        result.push(graphStep(graph, {
            phase: "结束",
            visited: Array.from(visited),
            description: "队列为空，目标不可达。",
            codeLine: 7,
            state: { goal: goal, result: "unreachable" },
        }));
        return result;
    }

    function buildDfsSteps(input) {
        var graph = input.graph;
        var route = parseRoute(input.target, graph.nodes[0], graph.nodes[graph.nodes.length - 1]);
        var adjacency = adjacencyFromGraph(graph, false);
        var start = graph.nodes.indexOf(route.start) === -1 ? graph.nodes[0] : route.start;
        var goal = graph.nodes.indexOf(route.goal) === -1 ? graph.nodes[graph.nodes.length - 1] : route.goal;
        var stack = [start];
        var visited = new Set();
        var parent = {};
        var result = [
            graphStep(graph, {
                phase: "初始化",
                activeNodes: [start],
                description: "从起点 " + start + " 入栈，准备深度优先探索。",
                codeLine: 1,
                state: { start: start, goal: goal, stack: stack.slice() },
            }),
        ];

        while (stack.length) {
            var current = stack.pop();
            if (visited.has(current)) {
                continue;
            }
            visited.add(current);
            result.push(graphStep(graph, {
                phase: "访问",
                visited: Array.from(visited),
                activeNodes: [current],
                description: "弹出并访问节点 " + current + "。",
                codeLine: 3,
                state: { current: current, stack: stack.slice() },
            }));
            if (current === goal) {
                result.push(graphStep(graph, {
                    phase: "命中",
                    visited: Array.from(visited),
                    foundNodes: [goal],
                    activeEdges: buildPathEdges(parent, start, goal),
                    description: "DFS 到达目标，当前路径被保留。",
                    codeLine: 4,
                    state: { path: buildPath(parent, start, goal) },
                }));
                return result;
            }
            adjacency[current].slice().reverse().forEach(function (neighbor) {
                if (!visited.has(neighbor.node)) {
                    parent[neighbor.node] = current;
                    stack.push(neighbor.node);
                    result.push(graphStep(graph, {
                        phase: "压栈",
                        visited: Array.from(visited),
                        activeNodes: [neighbor.node],
                        activeEdges: [edgeKey(current, neighbor.node)],
                        description: "将邻接点 " + neighbor.node + " 压入栈顶。",
                        codeLine: 6,
                        state: { current: current, push: neighbor.node, stack: stack.slice() },
                    }));
                }
            });
        }

        result.push(graphStep(graph, {
            phase: "结束",
            visited: Array.from(visited),
            description: "栈为空，目标不可达。",
            codeLine: 7,
            state: { goal: goal, result: "unreachable" },
        }));
        return result;
    }

    function buildDijkstraSteps(input) {
        var graph = input.graph;
        var route = parseRoute(input.target, graph.nodes[0], graph.nodes[graph.nodes.length - 1]);
        var adjacency = adjacencyFromGraph(graph, true);
        var start = graph.nodes.indexOf(route.start) === -1 ? graph.nodes[0] : route.start;
        var goal = graph.nodes.indexOf(route.goal) === -1 ? graph.nodes[graph.nodes.length - 1] : route.goal;
        var dist = {};
        var prev = {};
        var unvisited = new Set(graph.nodes);
        graph.nodes.forEach(function (node) {
            dist[node] = node === start ? 0 : Infinity;
        });
        var result = [
            graphStep(graph, {
                phase: "初始化",
                activeNodes: [start],
                description: "起点距离设为 0，其余节点为 ∞。",
                codeLine: 1,
                state: { start: start, goal: goal, dist: formatDistances(dist) },
            }),
        ];

        while (unvisited.size) {
            var current = null;
            unvisited.forEach(function (node) {
                if (current === null || dist[node] < dist[current]) {
                    current = node;
                }
            });
            if (current === null || dist[current] === Infinity) {
                break;
            }
            unvisited.delete(current);
            result.push(graphStep(graph, {
                phase: "选点",
                visited: graph.nodes.filter(function (node) { return !unvisited.has(node); }),
                activeNodes: [current],
                description: "选择未确定节点中距离最小的 " + current + "。",
                codeLine: 2,
                state: { current: current, dist: formatDistances(dist) },
            }));
            if (current === goal) {
                result.push(graphStep(graph, {
                    phase: "命中",
                    visited: graph.nodes.filter(function (node) { return !unvisited.has(node); }),
                    foundNodes: [goal],
                    activeEdges: buildPathEdges(prev, start, goal),
                    description: "目标节点距离已确定，最短路径完成。",
                    codeLine: 3,
                    state: { distance: dist[goal], path: buildPath(prev, start, goal) },
                }));
                return result;
            }
            adjacency[current].forEach(function (neighbor) {
                if (!unvisited.has(neighbor.node)) {
                    return;
                }
                var candidate = dist[current] + neighbor.weight;
                result.push(graphStep(graph, {
                    phase: "松弛",
                    visited: graph.nodes.filter(function (node) { return !unvisited.has(node); }),
                    activeNodes: [current, neighbor.node],
                    activeEdges: [edgeKey(current, neighbor.node)],
                    description: "尝试用 " + current + " 更新 " + neighbor.node + " 的最短距离。",
                    codeLine: 5,
                    state: { edge: current + "-" + neighbor.node, candidate: candidate, old: dist[neighbor.node] },
                }));
                if (candidate < dist[neighbor.node]) {
                    dist[neighbor.node] = candidate;
                    prev[neighbor.node] = current;
                    result.push(graphStep(graph, {
                        phase: "更新",
                        visited: graph.nodes.filter(function (node) { return !unvisited.has(node); }),
                        activeNodes: [neighbor.node],
                        activeEdges: [edgeKey(current, neighbor.node)],
                        description: "发现更短路径，更新距离和前驱。",
                        codeLine: 6,
                        state: { node: neighbor.node, dist: formatDistances(dist), prev: prev[neighbor.node] },
                    }));
                }
            });
        }

        result.push(graphStep(graph, {
            phase: "结束",
            visited: graph.nodes.filter(function (node) { return !unvisited.has(node); }),
            description: "剩余节点不可达，未找到目标路径。",
            codeLine: 7,
            state: { goal: goal, result: "unreachable" },
        }));
        return result;
    }

    function hashValue(value, size) {
        var numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return Math.abs(Math.round(numeric)) % size;
        }
        var sum = 0;
        String(value).split("").forEach(function (char) {
            sum += char.charCodeAt(0);
        });
        return sum % size;
    }

    function buildHashSteps(input) {
        var values = input.tokens;
        var size = 7;
        var buckets = Array.from({ length: size }, function () { return []; });
        var result = [
            makeStep({
                kind: "hash",
                viewLabel: "散列表视图",
                phase: "初始化",
                buckets: clone(buckets),
                description: "使用链地址法处理冲突。",
                codeLine: 1,
                state: { bucketCount: size },
            }),
        ];

        values.forEach(function (value) {
            var index = hashValue(value, size);
            result.push(makeStep({
                kind: "hash",
                viewLabel: "散列表视图",
                phase: "计算哈希",
                buckets: clone(buckets),
                activeBucket: index,
                description: "hash(" + value + ") = " + index + "。",
                codeLine: 2,
                state: { value: value, bucket: index, collision: buckets[index].length > 0 },
            }));
            buckets[index].push(value);
            result.push(makeStep({
                kind: "hash",
                viewLabel: "散列表视图",
                phase: buckets[index].length > 1 ? "冲突链入" : "插入",
                buckets: clone(buckets),
                activeBucket: index,
                activeValue: value,
                description: buckets[index].length > 1 ? "桶内已有元素，将新值追加到链表末尾。" : "桶为空，直接插入。",
                codeLine: buckets[index].length > 1 ? 4 : 3,
                state: { value: value, bucket: index, chainLength: buckets[index].length },
            }));
        });
        return result;
    }

    function buildHeapSteps(input) {
        var values = input.values.slice(0, 15);
        var heap = [];
        var result = [
            makeStep({
                kind: "heap",
                viewLabel: "堆视图",
                phase: "初始化",
                heap: heap.slice(),
                description: "最小堆满足每个父节点不大于子节点。",
                codeLine: 1,
                state: { size: 0 },
            }),
        ];

        function swap(i, j) {
            var temp = heap[i];
            heap[i] = heap[j];
            heap[j] = temp;
        }

        values.forEach(function (value) {
            heap.push(value);
            var index = heap.length - 1;
            result.push(makeStep({
                kind: "heap",
                viewLabel: "堆视图",
                phase: "插入",
                heap: heap.slice(),
                activeIndices: [index],
                description: "把 " + value + " 放到堆尾。",
                codeLine: 2,
                state: { inserted: value, index: index, size: heap.length },
            }));
            while (index > 0) {
                var parent = Math.floor((index - 1) / 2);
                result.push(makeStep({
                    kind: "heap",
                    viewLabel: "堆视图",
                    phase: "上浮比较",
                    heap: heap.slice(),
                    activeIndices: [parent, index],
                    description: "比较父节点 " + heap[parent] + " 与子节点 " + heap[index] + "。",
                    codeLine: 4,
                    state: { parent: parent, child: index },
                }));
                if (heap[parent] <= heap[index]) {
                    break;
                }
                swap(parent, index);
                result.push(makeStep({
                    kind: "heap",
                    viewLabel: "堆视图",
                    phase: "上浮交换",
                    heap: heap.slice(),
                    activeIndices: [parent, index],
                    description: "子节点更小，与父节点交换。",
                    codeLine: 5,
                    state: { parent: parent, child: index },
                }));
                index = parent;
            }
        });

        if (heap.length) {
            var min = heap[0];
            heap[0] = heap[heap.length - 1];
            heap.pop();
            result.push(makeStep({
                kind: "heap",
                viewLabel: "堆视图",
                phase: "删除堆顶",
                heap: heap.slice(),
                activeIndices: [0],
                description: "移除最小值 " + min + "，将堆尾放到根节点。",
                codeLine: 7,
                state: { removed: min, size: heap.length },
            }));
            var current = 0;
            while (true) {
                var left = current * 2 + 1;
                var right = current * 2 + 2;
                var smallest = current;
                if (left < heap.length && heap[left] < heap[smallest]) {
                    smallest = left;
                }
                if (right < heap.length && heap[right] < heap[smallest]) {
                    smallest = right;
                }
                if (smallest === current) {
                    break;
                }
                result.push(makeStep({
                    kind: "heap",
                    viewLabel: "堆视图",
                    phase: "下沉比较",
                    heap: heap.slice(),
                    activeIndices: [current, smallest],
                    description: "选择更小的子节点进行比较。",
                    codeLine: 9,
                    state: { current: current, child: smallest },
                }));
                swap(current, smallest);
                result.push(makeStep({
                    kind: "heap",
                    viewLabel: "堆视图",
                    phase: "下沉交换",
                    heap: heap.slice(),
                    activeIndices: [current, smallest],
                    description: "根节点较大，向下交换恢复堆序。",
                    codeLine: 10,
                    state: { current: current, child: smallest },
                }));
                current = smallest;
            }
        }
        return result;
    }

    function edgeKey(a, b) {
        return [a, b].sort().join("->");
    }

    function buildPath(parent, start, goal) {
        var path = [];
        var current = goal;
        while (current && current !== start) {
            path.unshift(current);
            current = parent[current];
        }
        if (current === start) {
            path.unshift(start);
        }
        return path.length ? path : [start];
    }

    function buildPathEdges(parent, start, goal) {
        var path = buildPath(parent, start, goal);
        var edges = [];
        for (var i = 0; i < path.length - 1; i += 1) {
            edges.push(edgeKey(path[i], path[i + 1]));
        }
        return edges;
    }

    function formatDistances(dist) {
        var formatted = {};
        Object.keys(dist).forEach(function (key) {
            formatted[key] = dist[key] === Infinity ? "∞" : dist[key];
        });
        return formatted;
    }

    var ALGORITHMS = {
        "bubble-sort": {
            category: "排序",
            title: "冒泡排序",
            summary: "相邻比较，较大值逐轮右移",
            complexity: "O(n²)",
            defaultData: "8, 3, 5, 1, 9, 2",
            defaultTarget: "5",
            pseudo: [
                "for i from 0 to n - 2",
                "  for j from 0 to n - i - 2",
                "    if a[j] > a[j + 1]",
                "      swap a[j], a[j + 1]",
                "mark a[n - i - 1] sorted",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildBubbleSteps,
        },
        "selection-sort": {
            category: "排序",
            title: "选择排序",
            summary: "每轮选择无序区最小值",
            complexity: "O(n²)",
            defaultData: "7, 4, 9, 2, 6, 1",
            defaultTarget: "6",
            pseudo: [
                "for i from 0 to n - 2",
                "  min = i",
                "  for j from i + 1 to n - 1",
                "    if a[j] < a[min]",
                "      min = j",
                "  swap a[i], a[min]",
                "mark a[i] sorted",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildSelectionSteps,
        },
        "insertion-sort": {
            category: "排序",
            title: "插入排序",
            summary: "把当前值插入左侧有序区",
            complexity: "O(n²)",
            defaultData: "6, 2, 8, 4, 1, 7",
            defaultTarget: "4",
            pseudo: [
                "for i from 1 to n - 1",
                "  key = a[i]",
                "  j = i - 1",
                "  while j >= 0 and a[j] > key",
                "    a[j + 1] = a[j]",
                "  a[j + 1] = key",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildInsertionSteps,
        },
        "quick-sort": {
            category: "排序",
            title: "快速排序",
            summary: "pivot 分区后递归排序",
            complexity: "O(n log n)",
            defaultData: "10, 4, 8, 3, 12, 6, 1",
            defaultTarget: "8",
            pseudo: [
                "quickSort(low, high)",
                "pivot = a[high]",
                "i = low - 1",
                "for j from low to high - 1",
                "  if a[j] <= pivot",
                "    swap a[++i], a[j]",
                "swap a[i + 1], a[high]",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildQuickSteps,
        },
        "merge-sort": {
            category: "排序",
            title: "归并排序",
            summary: "拆分到单点后有序合并",
            complexity: "O(n log n)",
            defaultData: "9, 5, 2, 7, 1, 8, 3",
            defaultTarget: "7",
            pseudo: [
                "split array into left and right",
                "mergeSort(left)",
                "mergeSort(right)",
                "while both parts have values",
                "  compare heads",
                "  write smaller value back",
                "append remaining values",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildMergeSteps,
        },
        "linear-search": {
            category: "查找",
            title: "线性查找",
            summary: "逐个检查直到命中",
            complexity: "O(n)",
            defaultData: "4, 9, 2, 7, 5, 1",
            defaultTarget: "7",
            pseudo: [
                "for i from 0 to n - 1",
                "  if a[i] == target",
                "    return i",
                "return -1",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildLinearSearchSteps,
        },
        "binary-search": {
            category: "查找",
            title: "二分查找",
            summary: "在有序数组中折半缩小区间",
            complexity: "O(log n)",
            defaultData: "12, 4, 9, 1, 7, 15, 3",
            defaultTarget: "9",
            pseudo: [
                "low = 0, high = n - 1",
                "mid = floor((low + high) / 2)",
                "if a[mid] == target",
                "  return mid",
                "if a[mid] < target",
                "  low = mid + 1",
                "else high = mid - 1",
                "return -1",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildBinarySearchSteps,
        },
        stack: {
            category: "线性结构",
            title: "栈 push / pop",
            summary: "后进先出，栈顶操作",
            complexity: "O(1)",
            defaultData: "A, B, C, D",
            defaultTarget: "",
            pseudo: [
                "create empty stack",
                "push(value) to top",
                "top points to last item",
                "pop() removes top",
            ],
            prepare: prepareTokenInput,
            buildSteps: buildStackSteps,
        },
        queue: {
            category: "线性结构",
            title: "队列 enqueue / dequeue",
            summary: "先进先出，队头出队",
            complexity: "O(1)",
            defaultData: "A, B, C, D",
            defaultTarget: "",
            pseudo: [
                "create empty queue",
                "enqueue(value) to rear",
                "front stays at head",
                "dequeue() removes front",
            ],
            prepare: prepareTokenInput,
            buildSteps: buildQueueSteps,
        },
        "linked-list": {
            category: "线性结构",
            title: "单链表插入 / 删除",
            summary: "沿 next 指针定位并重连",
            complexity: "O(n)",
            defaultData: "A, B, C, D",
            defaultTarget: "insert:X@2",
            pseudo: [
                "current = head",
                "move until target position/value",
                "new.next = current.next",
                "current.next = new",
                "or bypass target node",
            ],
            prepare: prepareTokenInput,
            buildSteps: buildLinkedListSteps,
        },
        "bst": {
            category: "树",
            title: "二叉搜索树插入与查找",
            summary: "左小右大，沿比较路径移动",
            complexity: "O(h)",
            defaultData: "8, 4, 12, 2, 6, 10, 14, 5",
            defaultTarget: "10",
            pseudo: [
                "if tree is empty, create root",
                "compare value with current",
                "go left if value is smaller",
                "go right if value is larger",
                "insert at empty child",
                "skip duplicate values",
                "search target along same rule",
                "return found node",
                "return not found",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildBstSteps,
        },
        "graph-bfs": {
            category: "图",
            title: "广度优先搜索 BFS",
            summary: "队列按层扩展节点",
            complexity: "O(V + E)",
            defaultData: "A-B:1, A-C:1, B-D:1, C-E:1, D-F:1, E-F:1",
            defaultTarget: "A->F",
            pseudo: [
                "queue = [start]",
                "visited.add(start)",
                "while queue is not empty",
                "  current = queue.shift()",
                "  if current == goal return path",
                "  enqueue each unvisited neighbor",
                "return unreachable",
            ],
            prepare: prepareGraphInput,
            buildSteps: buildBfsSteps,
        },
        "graph-dfs": {
            category: "图",
            title: "深度优先搜索 DFS",
            summary: "栈驱动，沿分支深入",
            complexity: "O(V + E)",
            defaultData: "A-B:1, A-C:1, B-D:1, C-E:1, D-F:1, E-F:1",
            defaultTarget: "A->F",
            pseudo: [
                "stack = [start]",
                "while stack is not empty",
                "  current = stack.pop()",
                "  if current == goal return path",
                "  mark current visited",
                "  push unvisited neighbors",
                "return unreachable",
            ],
            prepare: prepareGraphInput,
            buildSteps: buildDfsSteps,
        },
        "dijkstra": {
            category: "图",
            title: "Dijkstra 最短路径",
            summary: "反复确定当前最短节点",
            complexity: "O(V² + E)",
            defaultData: "A-B:4, A-C:2, B-D:5, C-D:1, C-E:7, D-F:3, E-F:1",
            defaultTarget: "A->F",
            pseudo: [
                "dist[start] = 0, others = infinity",
                "pick unvisited node with smallest dist",
                "if node is goal return path",
                "for each neighbor",
                "  candidate = dist[node] + weight",
                "  update dist and previous if smaller",
                "return unreachable",
            ],
            prepare: prepareGraphInput,
            buildSteps: buildDijkstraSteps,
        },
        "hash-table": {
            category: "散列表",
            title: "散列表链地址法",
            summary: "哈希取桶，冲突追加到链",
            complexity: "O(1)",
            defaultData: "18, 25, 11, 32, 39, 46, 14",
            defaultTarget: "",
            pseudo: [
                "create buckets",
                "index = hash(value) % bucketCount",
                "if bucket is empty insert value",
                "else append value to chain",
            ],
            prepare: prepareTokenInput,
            buildSteps: buildHashSteps,
        },
        heap: {
            category: "堆",
            title: "最小堆插入 / 删除",
            summary: "上浮与下沉维护堆序",
            complexity: "O(log n)",
            defaultData: "9, 4, 7, 1, 6, 3, 8",
            defaultTarget: "",
            pseudo: [
                "create empty min heap",
                "append value at heap tail",
                "while parent is greater",
                "  compare parent and child",
                "  swap upward",
                "remove root",
                "move tail to root",
                "while child is smaller",
                "  choose smaller child",
                "  swap downward",
            ],
            prepare: prepareNumericInput,
            buildSteps: buildHeapSteps,
        },
    };

    function prepareNumericInput(algorithm) {
        var fallback = parseNumbers(algorithm.defaultData, [8, 3, 5, 1, 9, 2]);
        var values = parseNumbers(refs.dataInput.value, fallback);
        return {
            values: values,
            tokens: values.map(String),
            target: parseTarget(refs.targetInput.value, algorithm.defaultTarget),
            numericTarget: parseNumericTarget(refs.targetInput.value, Number(algorithm.defaultTarget) || values[0]),
        };
    }

    function prepareTokenInput(algorithm) {
        var fallback = parseTokens(algorithm.defaultData, ["A", "B", "C"]);
        var tokens = parseTokens(refs.dataInput.value, fallback);
        return {
            values: tokens,
            tokens: tokens,
            target: parseTarget(refs.targetInput.value, algorithm.defaultTarget),
            numericTarget: parseNumericTarget(refs.targetInput.value, 0),
        };
    }

    function prepareGraphInput(algorithm) {
        var graph = parseGraph(refs.dataInput.value, algorithm.defaultData);
        return {
            graph: graph,
            target: parseTarget(refs.targetInput.value, algorithm.defaultTarget),
        };
    }

    function initRefs() {
        refs.categoryTabs = document.getElementById("categoryTabs");
        refs.algorithmList = document.getElementById("algorithmList");
        refs.libraryCount = document.getElementById("library-count");
        refs.algorithmCategory = document.getElementById("algorithmCategory");
        refs.algorithmTitle = document.getElementById("algorithmTitle");
        refs.stepIndex = document.getElementById("stepIndex");
        refs.stepTotal = document.getElementById("stepTotal");
        refs.complexityLabel = document.getElementById("complexityLabel");
        refs.dataInput = document.getElementById("dataInput");
        refs.targetInput = document.getElementById("targetInput");
        refs.exampleButton = document.getElementById("exampleButton");
        refs.buildButton = document.getElementById("buildButton");
        refs.viewModeLabel = document.getElementById("viewModeLabel");
        refs.currentPhase = document.getElementById("currentPhase");
        refs.visualStage = document.getElementById("visualStage");
        refs.prevButton = document.getElementById("prevButton");
        refs.playButton = document.getElementById("playButton");
        refs.nextButton = document.getElementById("nextButton");
        refs.resetButton = document.getElementById("resetButton");
        refs.speedRange = document.getElementById("speedRange");
        refs.speedValue = document.getElementById("speedValue");
        refs.timelineFill = document.getElementById("timelineFill");
        refs.stateBadge = document.getElementById("stateBadge");
        refs.stateGrid = document.getElementById("stateGrid");
        refs.stepDescription = document.getElementById("stepDescription");
        refs.pseudoCode = document.getElementById("pseudoCode");
        refs.stepLog = document.getElementById("stepLog");
    }

    function algorithmEntries() {
        return Object.keys(ALGORITHMS).map(function (id) {
            return Object.assign({ id: id }, ALGORITHMS[id]);
        });
    }

    function renderCategories() {
        refs.categoryTabs.innerHTML = CATEGORY_ORDER.map(function (category) {
            var count = algorithmEntries().filter(function (item) {
                return item.category === category;
            }).length;
            return "<button class=\"category-tab" + (category === selectedCategory ? " active" : "") + "\" type=\"button\" data-category=\"" + escapeHtml(category) + "\">" +
                escapeHtml(category) + " · " + count +
                "</button>";
        }).join("");
        refs.libraryCount.textContent = String(algorithmEntries().length);
    }

    function renderAlgorithmList() {
        refs.algorithmList.innerHTML = algorithmEntries()
            .filter(function (item) {
                return item.category === selectedCategory;
            })
            .map(function (item) {
                return "<button class=\"algorithm-item" + (item.id === selectedAlgorithmId ? " active" : "") + "\" type=\"button\" data-algorithm=\"" + escapeHtml(item.id) + "\">" +
                    "<strong>" + escapeHtml(item.title) + "</strong>" +
                    "<span>" + escapeHtml(item.summary) + "</span>" +
                    "</button>";
            }).join("");
    }

    function setSelectedAlgorithm(id, resetInput) {
        selectedAlgorithmId = id;
        selectedCategory = ALGORITHMS[id].category;
        stopPlayback();
        renderCategories();
        renderAlgorithmList();
        if (resetInput) {
            refs.dataInput.value = ALGORITHMS[id].defaultData;
            refs.targetInput.value = ALGORITHMS[id].defaultTarget;
        }
        buildCurrentSteps();
    }

    function buildCurrentSteps() {
        var algorithm = ALGORITHMS[selectedAlgorithmId];
        try {
            var input = algorithm.prepare(algorithm);
            steps = algorithm.buildSteps(input);
            if (!steps.length) {
                steps = [makeStep({ phase: "空数据", description: "没有可执行的数据。", state: {} })];
            }
        } catch (error) {
            steps = [makeStep({
                kind: "empty",
                phase: "输入错误",
                description: "无法解析当前输入：" + error.message,
                state: { error: error.message },
            })];
        }
        currentStep = 0;
        renderAll();
    }

    function renderAll() {
        var algorithm = ALGORITHMS[selectedAlgorithmId];
        refs.algorithmCategory.textContent = algorithm.category;
        refs.algorithmTitle.textContent = algorithm.title;
        refs.complexityLabel.textContent = algorithm.complexity;
        renderPseudoCode(algorithm.pseudo, steps[currentStep] ? steps[currentStep].codeLine : 1);
        renderStep();
        renderLog();
    }

    function renderPseudoCode(lines, activeLine) {
        refs.pseudoCode.innerHTML = lines.map(function (line, index) {
            var number = index + 1;
            return "<li class=\"" + (number === activeLine ? "active" : "") + "\">" +
                "<span class=\"line-no\">" + number + "</span>" +
                "<code>" + escapeHtml(line) + "</code>" +
                "</li>";
        }).join("");
    }

    function renderStep() {
        var step = steps[currentStep] || makeStep({});
        refs.stepIndex.textContent = String(currentStep + 1);
        refs.stepTotal.textContent = String(steps.length);
        refs.viewModeLabel.textContent = step.viewLabel || "动画视图";
        refs.currentPhase.textContent = step.phase || "执行中";
        refs.stateBadge.textContent = step.phase || "执行中";
        refs.stepDescription.textContent = step.description || "";
        refs.timelineFill.style.width = steps.length > 1 ? ((currentStep / (steps.length - 1)) * 100) + "%" : "100%";
        renderState(step.state || {});
        renderVisual(step);
        renderPseudoCode(ALGORITHMS[selectedAlgorithmId].pseudo, step.codeLine || 1);
        refs.prevButton.disabled = currentStep === 0;
        refs.nextButton.disabled = currentStep >= steps.length - 1;
    }

    function renderState(state) {
        var keys = Object.keys(state);
        if (!keys.length) {
            refs.stateGrid.innerHTML = "<div><dt>状态</dt><dd>-</dd></div>";
            return;
        }
        refs.stateGrid.innerHTML = keys.map(function (key) {
            return "<div><dt>" + escapeHtml(key) + "</dt><dd>" + escapeHtml(compactValue(state[key])) + "</dd></div>";
        }).join("");
    }

    function renderLog() {
        var start = Math.max(0, currentStep - 38);
        var end = Math.min(steps.length, start + 80);
        refs.stepLog.innerHTML = steps.slice(start, end).map(function (step, offset) {
            var index = start + offset;
            return "<div class=\"log-row" + (index === currentStep ? " active" : "") + "\">" +
                "<span class=\"log-index\">#" + (index + 1) + "</span>" +
                "<span>" + escapeHtml(step.phase || "执行") + " · " + escapeHtml(step.description || "") + "</span>" +
                "</div>";
        }).join("");
    }

    function renderVisual(step) {
        if (step.kind === "array") {
            refs.visualStage.innerHTML = renderArray(step);
        } else if (step.kind === "stack") {
            refs.visualStage.innerHTML = renderStack(step);
        } else if (step.kind === "queue") {
            refs.visualStage.innerHTML = renderQueue(step);
        } else if (step.kind === "linked") {
            refs.visualStage.innerHTML = renderLinked(step);
        } else if (step.kind === "tree") {
            refs.visualStage.innerHTML = renderTree(step);
        } else if (step.kind === "graph") {
            refs.visualStage.innerHTML = renderGraph(step);
        } else if (step.kind === "hash") {
            refs.visualStage.innerHTML = renderHash(step);
        } else if (step.kind === "heap") {
            refs.visualStage.innerHTML = renderHeap(step);
        } else {
            refs.visualStage.innerHTML = "<div class=\"empty-visual\">" + escapeHtml(step.description || "暂无动画") + "</div>";
        }
    }

    function pointerLabels(step, index) {
        var pointers = step.pointers || {};
        return Object.keys(pointers).filter(function (key) {
            return pointers[key] === index;
        }).join(" ");
    }

    function renderArray(step) {
        var array = step.array || [];
        if (!array.length) {
            return "<div class=\"empty-visual\">空数组</div>";
        }
        var max = Math.max.apply(null, array);
        var min = Math.min.apply(null, array);
        var spread = max === min ? 1 : max - min;
        return "<div class=\"array-visual\">" + array.map(function (value, index) {
            var height = 42 + ((value - min) / spread) * 230;
            if (max === min) {
                height = 140;
            }
            var classes = "bar " + (step.status && step.status[index] ? step.status[index] : "");
            return "<div class=\"bar-wrap\">" +
                "<div class=\"bar-pointer\">" + escapeHtml(pointerLabels(step, index)) + "</div>" +
                "<div class=\"" + escapeHtml(classes) + "\" style=\"height:" + Math.round(height) + "px\"></div>" +
                "<div class=\"bar-label\">" + escapeHtml(value) + "</div>" +
                "</div>";
        }).join("") + "</div>";
    }

    function renderStack(step) {
        var values = step.values || [];
        if (!values.length) {
            return "<div class=\"empty-visual\">空栈</div>";
        }
        return "<div class=\"linear-visual\">" +
            "<div class=\"stack-column\">" +
            values.map(function (value, index) {
                return "<div class=\"stack-cell" + (index === step.activeIndex ? " active" : "") + "\">" + escapeHtml(value) + "</div>";
            }).join("") +
            "</div>" +
            "</div>";
    }

    function renderQueue(step) {
        var values = step.values || [];
        if (!values.length) {
            return "<div class=\"empty-visual\">空队列</div>";
        }
        return "<div class=\"linear-visual\">" +
            "<div class=\"queue-labels\"><span>front</span><span>rear</span></div>" +
            "<div class=\"queue-lane\">" +
            values.map(function (value, index) {
                var cls = index === step.activeIndex ? " active" : "";
                if (index === 0) {
                    cls += " visited";
                }
                return "<div class=\"queue-slot" + cls + "\">" + escapeHtml(value) + "</div>";
            }).join("") +
            "</div>" +
            "</div>";
    }

    function renderLinked(step) {
        var values = step.values || [];
        if (!values.length) {
            return "<div class=\"empty-visual\">空链表</div>";
        }
        return "<div class=\"linear-visual\"><div class=\"node-row\">" +
            values.map(function (value, index) {
                var cls = "ds-node";
                if (index === step.activeIndex) {
                    cls += " active";
                }
                if (index === step.targetIndex) {
                    cls += " target";
                }
                var node = "<div class=\"" + cls + "\">" + escapeHtml(value) + "</div>";
                if (index < values.length - 1) {
                    node += "<span class=\"arrow-link\">next</span>";
                }
                return node;
            }).join("") +
            "<span class=\"arrow-link\">null</span>" +
            "</div></div>";
    }

    function layoutTree(root) {
        var nodes = [];
        var edges = [];
        var cursor = 0;

        function walk(node, depth, parentId) {
            if (!node) {
                return null;
            }
            var id = nodes.length;
            var left = walk(node.left, depth + 1, id);
            var x;
            if (left !== null) {
                x = left;
            } else {
                x = cursor;
                cursor += 1;
            }
            var right = walk(node.right, depth + 1, id);
            if (right !== null) {
                x = (x + right) / 2;
            }
            nodes.push({ id: id, value: node.value, x: x, y: depth, parentId: parentId });
            if (parentId !== null) {
                edges.push({ from: parentId, to: id });
            }
            return x;
        }

        walk(root, 0, null);
        var idMap = {};
        nodes.forEach(function (node) {
            idMap[node.id] = node;
        });
        return {
            nodes: nodes,
            edges: edges,
            idMap: idMap,
            width: Math.max(760, Math.max(1, cursor) * 92),
            height: Math.max(330, (Math.max.apply(null, nodes.map(function (node) { return node.y; }).concat([0])) + 1) * 92 + 50),
        };
    }

    function renderTree(step) {
        if (!step.tree) {
            return "<div class=\"empty-visual\">空树</div>";
        }
        var layout = layoutTree(step.tree);
        var active = new Set((step.activeValues || []).map(String));
        var found = new Set((step.foundValues || []).map(String));
        var target = new Set((step.targetValues || []).map(String));
        var edges = layout.edges.map(function (edge) {
            var from = layout.idMap[edge.from];
            var to = layout.idMap[edge.to];
            return "<line class=\"edge-line\" x1=\"" + treeX(from, layout.width) + "\" y1=\"" + treeY(from) + "\" x2=\"" + treeX(to, layout.width) + "\" y2=\"" + treeY(to) + "\"></line>";
        }).join("");
        var nodes = layout.nodes.map(function (node) {
            var classes = "tree-node";
            if (target.has(String(node.value))) {
                classes += " active";
            }
            if (active.has(String(node.value))) {
                classes += " active";
            }
            if (found.has(String(node.value))) {
                classes += " found";
            }
            var labelClass = found.has(String(node.value)) ? "node-label on-dark" : "node-label";
            return "<g>" +
                "<circle class=\"" + classes + "\" cx=\"" + treeX(node, layout.width) + "\" cy=\"" + treeY(node) + "\" r=\"22\"></circle>" +
                "<text class=\"" + labelClass + "\" x=\"" + treeX(node, layout.width) + "\" y=\"" + treeY(node) + "\">" + escapeHtml(node.value) + "</text>" +
                "</g>";
        }).join("");
        return "<svg class=\"svg-stage\" viewBox=\"0 0 " + layout.width + " " + layout.height + "\" role=\"img\" aria-label=\"树动画\">" + edges + nodes + "</svg>";
    }

    function treeX(node, width) {
        return 46 + node.x * 92 + Math.max(0, (width - 92 * 8) / 40);
    }

    function treeY(node) {
        return 42 + node.y * 86;
    }

    function graphPositions(nodes) {
        var width = 860;
        var height = 330;
        var radiusX = 310;
        var radiusY = 112;
        var centerX = width / 2;
        var centerY = height / 2;
        var positions = {};
        nodes.forEach(function (node, index) {
            var angle = -Math.PI / 2 + (Math.PI * 2 * index) / nodes.length;
            positions[node] = {
                x: centerX + Math.cos(angle) * radiusX,
                y: centerY + Math.sin(angle) * radiusY,
            };
        });
        return { width: width, height: height, positions: positions };
    }

    function renderGraph(step) {
        var graph = step.graph;
        if (!graph || !graph.nodes.length) {
            return "<div class=\"empty-visual\">空图</div>";
        }
        var layout = graphPositions(graph.nodes);
        var visited = new Set(step.visited || []);
        var active = new Set(step.activeNodes || []);
        var found = new Set(step.foundNodes || []);
        var activeEdges = new Set(step.activeEdges || []);
        var edges = graph.edges.map(function (edge) {
            var from = layout.positions[edge.from];
            var to = layout.positions[edge.to];
            var key = edgeKey(edge.from, edge.to);
            var midX = (from.x + to.x) / 2;
            var midY = (from.y + to.y) / 2;
            return "<g>" +
                "<line class=\"edge-line" + (activeEdges.has(key) ? " active" : "") + "\" x1=\"" + from.x + "\" y1=\"" + from.y + "\" x2=\"" + to.x + "\" y2=\"" + to.y + "\"></line>" +
                "<text class=\"edge-label\" x=\"" + midX + "\" y=\"" + (midY - 6) + "\">" + escapeHtml(edge.weight) + "</text>" +
                "</g>";
        }).join("");
        var nodes = graph.nodes.map(function (node) {
            var pos = layout.positions[node];
            var classes = "graph-node";
            if (visited.has(node)) {
                classes += " visited";
            }
            if (active.has(node)) {
                classes += " active";
            }
            if (found.has(node)) {
                classes += " found";
            }
            var labelClass = found.has(node) ? "node-label on-dark" : "node-label";
            return "<g>" +
                "<circle class=\"" + classes + "\" cx=\"" + pos.x + "\" cy=\"" + pos.y + "\" r=\"24\"></circle>" +
                "<text class=\"" + labelClass + "\" x=\"" + pos.x + "\" y=\"" + pos.y + "\">" + escapeHtml(node) + "</text>" +
                "</g>";
        }).join("");
        return "<svg class=\"svg-stage\" viewBox=\"0 0 " + layout.width + " " + layout.height + "\" role=\"img\" aria-label=\"图动画\">" + edges + nodes + "</svg>";
    }

    function renderHash(step) {
        var buckets = step.buckets || [];
        return "<div class=\"hash-visual\">" + buckets.map(function (bucket, index) {
            var cells = bucket.map(function (value) {
                var cls = "bucket-cell";
                if (index === step.activeBucket) {
                    cls += " active";
                }
                if (String(value) === String(step.activeValue)) {
                    cls += " target";
                }
                return "<div class=\"" + cls + "\">" + escapeHtml(value) + "</div>";
            }).join("");
            if (!cells) {
                cells = "<div class=\"bucket-cell\">∅</div>";
            }
            return "<div class=\"bucket-row\">" +
                "<div class=\"bucket-label\">[" + index + "]</div>" +
                "<div class=\"bucket-chain\">" + cells + "</div>" +
                "</div>";
        }).join("") + "</div>";
    }

    function renderHeap(step) {
        var heap = step.heap || [];
        if (!heap.length) {
            return "<div class=\"empty-visual\">空堆</div>";
        }
        var width = 860;
        var height = 300;
        var active = new Set(step.activeIndices || []);
        function pos(index) {
            var level = Math.floor(Math.log2(index + 1));
            var start = Math.pow(2, level) - 1;
            var offset = index - start;
            var count = Math.pow(2, level);
            return {
                x: (width / (count + 1)) * (offset + 1),
                y: 42 + level * 74,
            };
        }
        var edges = heap.map(function (_, index) {
            if (index === 0) {
                return "";
            }
            var parent = Math.floor((index - 1) / 2);
            var a = pos(parent);
            var b = pos(index);
            return "<line class=\"edge-line\" x1=\"" + a.x + "\" y1=\"" + a.y + "\" x2=\"" + b.x + "\" y2=\"" + b.y + "\"></line>";
        }).join("");
        var nodes = heap.map(function (value, index) {
            var p = pos(index);
            var cls = "tree-node" + (active.has(index) ? " active" : "");
            return "<g>" +
                "<circle class=\"" + cls + "\" cx=\"" + p.x + "\" cy=\"" + p.y + "\" r=\"22\"></circle>" +
                "<text class=\"node-label\" x=\"" + p.x + "\" y=\"" + p.y + "\">" + escapeHtml(value) + "</text>" +
                "</g>";
        }).join("");
        var array = "<div class=\"heap-array\">" + heap.map(function (value, index) {
            return "<div class=\"ds-node" + (active.has(index) ? " active" : "") + "\">" + escapeHtml(index + ":" + value) + "</div>";
        }).join("") + "</div>";
        return "<div class=\"linear-visual\">" +
            "<svg class=\"svg-stage\" viewBox=\"0 0 " + width + " " + height + "\" role=\"img\" aria-label=\"堆动画\">" + edges + nodes + "</svg>" +
            array +
            "</div>";
    }

    function nextStep() {
        if (currentStep < steps.length - 1) {
            currentStep += 1;
            renderStep();
            renderLog();
        } else {
            stopPlayback();
        }
    }

    function prevStep() {
        if (currentStep > 0) {
            currentStep -= 1;
            renderStep();
            renderLog();
        }
    }

    function resetSteps() {
        stopPlayback();
        currentStep = 0;
        renderStep();
        renderLog();
    }

    function play() {
        if (currentStep >= steps.length - 1) {
            currentStep = 0;
        }
        refs.playButton.textContent = "暂停";
        refs.playButton.classList.add("playing");
        playerTimer = window.setInterval(nextStep, Number(refs.speedRange.value));
    }

    function stopPlayback() {
        if (playerTimer) {
            window.clearInterval(playerTimer);
            playerTimer = null;
        }
        if (refs.playButton) {
            refs.playButton.textContent = "播放";
            refs.playButton.classList.remove("playing");
        }
    }

    function togglePlayback() {
        if (playerTimer) {
            stopPlayback();
        } else {
            play();
        }
    }

    function updateSpeedLabel() {
        refs.speedValue.textContent = (Number(refs.speedRange.value) / 1000).toFixed(2) + "s";
        if (playerTimer) {
            stopPlayback();
            play();
        }
    }

    function bindEvents() {
        refs.categoryTabs.addEventListener("click", function (event) {
            var button = event.target.closest("[data-category]");
            if (!button) {
                return;
            }
            selectedCategory = button.dataset.category;
            var first = algorithmEntries().find(function (item) {
                return item.category === selectedCategory;
            });
            if (first) {
                setSelectedAlgorithm(first.id, true);
            }
        });

        refs.algorithmList.addEventListener("click", function (event) {
            var button = event.target.closest("[data-algorithm]");
            if (!button) {
                return;
            }
            setSelectedAlgorithm(button.dataset.algorithm, true);
        });

        refs.exampleButton.addEventListener("click", function () {
            var algorithm = ALGORITHMS[selectedAlgorithmId];
            refs.dataInput.value = algorithm.defaultData;
            refs.targetInput.value = algorithm.defaultTarget;
            buildCurrentSteps();
        });
        refs.buildButton.addEventListener("click", buildCurrentSteps);
        refs.prevButton.addEventListener("click", prevStep);
        refs.nextButton.addEventListener("click", nextStep);
        refs.resetButton.addEventListener("click", resetSteps);
        refs.playButton.addEventListener("click", togglePlayback);
        refs.speedRange.addEventListener("input", updateSpeedLabel);
    }

    function init() {
        initRefs();
        bindEvents();
        updateSpeedLabel();
        renderCategories();
        renderAlgorithmList();
        refs.dataInput.value = ALGORITHMS[selectedAlgorithmId].defaultData;
        refs.targetInput.value = ALGORITHMS[selectedAlgorithmId].defaultTarget;
        buildCurrentSteps();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
