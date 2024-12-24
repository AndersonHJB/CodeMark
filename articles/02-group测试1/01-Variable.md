## 1. 理解变量——生活中的例子

### 1.1 从字面意思去理解

- 变：变化
- 量：大小

### 1.2 举个例子🌰

......

——所以，**<span style="color: orange">变量不就是在计算机的内存当中开辟空间，来存储数据。</span>**

**特点：** 变量的值会被覆盖，只会记着最后一个值。

## 2. 如何创建变量——赋值语句

1. **变量：通过变量名代表或引用某个值。**

......

2. 初始化赋值语句: **变量名 = 表达式** 「`=` 叫做：赋值运算符」

- 变量名：就是这个空间，我们叫它什么名字；
- 表达式：类似数学表达；

程序的运行逻辑：**从上到下，从右到左（这里的右，指的是先执行 = “右边的整体”），最后才是赋值。**

3. 代码实例

```python
x = 1  # 1 赋值给了 x，x 代表1
x = x + 10  # x + 10 等价于 1 + 10 最后得出 11，11 赋值给 x
print(x)  # print 打印、输出
# 井号是用来注释、注解，解释某一行代码的功能或者作用
```

```python
name1 = "lilei"
name2 = name1
print(name2)

# 覆盖
name1 = "lilei"
name1 = "hanmeimei"
print(name1)
```

## 3. 探究 print

### 3.1 同时输出多个数据

```python
a = 1
b = 2
c = 3
print(a, b, c)  # 使用 print 同时输出多个变量
```

从输出的结果可以看出，print 同时输出多个变量，每个值之间默认以空格间隔。

那么，我们可以修改这个默认空格间隔么？——答案显然是可以的。

使用 sep。

### 3.2 sep 修改多个变量同时输出的间隔

```python
a = 1
b = 2
c = 3
print(a, b, c, sep=' 间隔 ')
```

### 3.3 end 修改 print 输出结尾方式

```python
a = 1
b = 1
c = 1
print(a)
print(b)
print(c)
```

```python
a = 1
b = 1
c = 1
print(a, end='\n\n\n')  # 多换行几个，\n 是换行的意思
print(b)
print(c)
```

```python
a = 1
b = 1
c = 1
print(a, end=" Hugo is hugo ")  # 我们可以修改成不换行的字符串
print(b)  # 这行的输出就会紧接着上面输出的结尾输出
print(c)
```

### 3.4 end 和 sep 可以同时使用

```python
a = 1
b = 1
c = 1
print(a, b, c, sep="~", end=" love Python")
```

### 3.5 print 输出可以有提示的

```python
# 输出时可以添加提示，其实就是基于 print 同时输出多个变量
a = 1
print('a 的值是:', a)
```

## 4. 进阶的赋值方法

### 4.1 多个变量同时赋予相同的值

```python
a = b = c = 1
print(a, b, c)
```

### 4.2 多个变量同时赋予不同的值

```python
a, b, c = 1, 2, 3
print(a, b, c)
```

```python
Austin = "Coke"  # 该赋值可以理解为倒果汁的过程
Jaden = "juice"  # 该赋值可以理解为倒果汁的过程
print("Austin", Austin)
print("Jaden", Jaden)
empty_cup1 = Austin
empty_cup2 = Jaden
Austin = empty_cup2
Jaden = empty_cup1
print("Austin", Austin)
print("Jaden", Jaden)
```

```python
Austin = "Coke"  # 该赋值可以理解为倒果汁的过程
Jaden = "juice"  # 该赋值可以理解为倒果汁的过程
print("Austin", Austin)
print("Jaden", Jaden)
empty_cup = Austin
Austin = Jaden
Jaden = empty_cup
print("Austin", Austin)
print("Jaden", Jaden)
```

```python
Austin = "Coke"  # 该赋值可以理解为倒果汁的过程
Jaden = "juice"  # 该赋值可以理解为倒果汁的过程
print("Austin", Austin)
print("Jaden", Jaden)
Austin, Jaden = Jaden, Austin
print("Austin", Austin)
print("Jaden", Jaden)
```

## 5. 变量的命名规则

- 大小写英文、数字和 `_` 的结合，且不能用数字开头；
- 系统关键词不能做变量名使用「获取关键词列表：`help('keywords')`
- Python 中的变量名区分大小写；
- 变量名不能包含空格，但是可以使用下划线来分隔其中的单词；
- 不要使用 Python 的内置函数名称做变量；

```python
n = "A"
N = "a"
print(n)  # 如果变量不区分大小写的话，输出什么结果？—— a
# 但是，它区分大小写，所以输出的是 A
```

```python
# 数字不能开头
a121iy212c21 = "a"  # 数字不能开头，除了开头。你想放哪就放哪。
```

