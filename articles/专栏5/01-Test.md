---
title: 01-Variable
icon: yongyan
date: 2023-07-19 20:40:21
author: AI悦创
isOriginal: true
category: 
    - Python notebook
tag:
    - Python 1v1
sticky: false
star: false
article: true
timeline: true
navbar: true
sidebarIcon: true
headerDepth: 5
comment: true
lastUpdated: true
editLink: true
backToTop: true
toc: true
watermark: true
---

## 1. 理解变量——生活中的例子

### 1.1 从字面意思去理解

- 变：变化
- 量：大小

### 1.2 举个例子🌰

假如，你是班级当中的课代表，每个月需要统计班级中每个学生的月考成绩。月考成绩会每个月一张纸，每张纸上都会依次记录每个学生的月考成绩，例如：

1. 李雷    98分
2. 马冬梅    89分
3. 刘奕彤     96分
4. ......

某一天，老师要看刘奕彤 1月、2月、3月的成绩，这个时候作为课代表的你需要怎么办。——总不能直接把每个月的月考成绩单直接给老师，显然是不合适的。

我们应该把刘奕彤 1月、2月、3月的成绩抄写到单独的一张纸上，接着给老师。

那么，我们为什么不一开始直接为每一个学生分配一个信封呢？（也可以是档案袋）信封在一开始是扁的，当我们放东西（数据）进去之后，是不是鼓起来了？——是不是变化了？是不是有大小了呢？显然是的。

那么信封，是不是在我们当前所处的空间当中开辟空间，来存放数据并且说这是信封。

类似的有：冰箱，不也是在我们当前所处的空间中，开辟空间。

——所以，**<span style="color: orange">变量不就是在计算机的内存当中开辟空间，来存储数据。</span>**

**特点：** 变量的值会被覆盖，只会记着最后一个值。

## 2. 如何创建变量——赋值语句

1. **变量：通过变量名代表或引用某个值。**

- 女娲捏了泥人，泥人没有生命，女娲挥了挥手柳条，赋予给泥人生命。此时，泥人可以代表说是女娲的后人。「变量：泥人，值：女娲」`泥人 = 女娲`
- 全国人民代表大会中的人大代表，是由广大人民群众投票选举出来的。他们的权利不是自己获取的，所以他们可以说：我代表的是广大人民群众的意志。「变量：人大代表，值：人民群众」`人大代表 = 人民群众`

2. 初始化赋值语句: **变量名 = 表达式** 「`=` 叫做：赋值运算符」

- 变量名：就是这个空间，我们叫它什么名字；
- 表达式：类似数学表达；

程序的运行逻辑：**从上到下，从右到左（这里的右，指的是先执行 = “右边的整体”），最后才是赋值。**

3. 代码实例

::: code-tabs

@tab demo1

```python
x = 1  # 1 赋值给了 x，x 代表1
x = x + 10  # x + 10 等价于 1 + 10 最后得出 11，11 赋值给 x
print(x)  # print 打印、输出
# 井号是用来注释、注解，解释某一行代码的功能或者作用

# ---output---
11
```

@tab demo2

```python
name1 = "lilei"
name2 = name1
print(name2)

# 覆盖
name1 = "lilei"
name1 = "hanmeimei"
print(name1)

# ---output---
lilei
hanmeimei
```

:::

## 3. 探究 print

### 3.1 同时输出多个数据

```python
a = 1
b = 2
c = 3
print(a, b, c)  # 使用 print 同时输出多个变量

# ---output---
1 2 3
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

# ---output---
1 间隔 2 间隔 3
```

### 3.3 end 修改 print 输出结尾方式

::: code-tabs

@tab 原本

```python
a = 1
b = 1
c = 1
print(a)
print(b)
print(c)

# ---output---
1
1
1
```

@tab 修改结尾 end 1

```python
a = 1
b = 1
c = 1
print(a, end='\n\n\n')  # 多换行几个，\n 是换行的意思
print(b)
print(c)

# ---output---
1


1
1
```

@tab 修改 end 2

```python
a = 1
b = 1
c = 1
print(a, end=" Hugo is hugo ")  # 我们可以修改成不换行的字符串
print(b)  # 这行的输出就会紧接着上面输出的结尾输出
print(c)

# ---output---
1 Hugo is hugo 1
1
```

:::

### 3.4 end 和 sep 可以同时使用

```python
a = 1
b = 1
c = 1
print(a, b, c, sep="~", end=" love Python")

# ---output---
1~1~1 love Python
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

# ---output---
1 1 1
```

### 4.2 多个变量同时赋予不同的值

```python
a, b, c = 1, 2, 3
print(a, b, c)

# ---output---
1 2 3
```

::: center

<VPCard
  title="变量的专项练习"
  desc="交换果汁、多个变量输出"
  logo="/aiyc.svg"
  link="/column/py/basequestion/special_variabl.html"
  background="rgba(253, 230, 138, 0.15)"
/>

:::

::: code-tabs

@tab 方法一：引入两个空杯子

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

@tab 方法二：引入一个空杯子

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

@tab 方法三：Python 特有的方法

```python
Austin = "Coke"  # 该赋值可以理解为倒果汁的过程
Jaden = "juice"  # 该赋值可以理解为倒果汁的过程
print("Austin", Austin)
print("Jaden", Jaden)
Austin, Jaden = Jaden, Austin
print("Austin", Austin)
print("Jaden", Jaden)
```



:::





## 5. 变量的命名规则

- 大小写英文、数字和 `_` 的结合，且不能用数字开头；
- 系统关键词不能做变量名使用「获取关键词列表：`help('keywords')`
- Python 中的变量名区分大小写；
- 变量名不能包含空格，但是可以使用下划线来分隔其中的单词；
- 不要使用 Python 的内置函数名称做变量；

```python
Here is a list of the Python keywords.  Enter any keyword to get more help.

False               class               from                or
None                continue            global              pass
True                def                 if                  raise
and                 del                 import              return
as                  elif                in                  try
assert              else                is                  while
async               except              lambda              with
await               finally             nonlocal            yield
break               for                 not      
```

::: code-tabs

@tab Code1

```python
n = "A"
N = "a"
print(n)  # 如果变量不区分大小写的话，输出什么结果？—— a
# 但是，它区分大小写，所以输出的是 A

# out
A
```

@tab Code2

```python
# 数字不能开头
a121iy212c21 = "a"  # 数字不能开头，除了开头。你想放哪就放哪。
```

@tab Code3

```python
user_name = "aiyc"
```

@tab Code4

```python
print = "aiyc"  # 不能使用 Python 内置函数名命名
print(print) # python 分不清
```

@tab Code5

```python
# 关键词不能当作变量名
await = "aiyc"
print(await) # await 在 Python 当中有特殊功能，比如 while
```

:::

## 6. 练习

1. 在 Python 中，变量名可以以数字开始。
    - [ ] 对
    - [ ] 错

2. 在 Python 中，以下哪个变量名是有效的？
    - [ ] 2myVar
    - [ ] myVar2
    - [ ] my-var
    - [ ] my var

3. 在 Python 中，变量名区分大小写。
    - [ ] 对
    - [ ] 错

4. 在 Python 中，`my_var` 和 `myVar` 是同一个变量。
    - [ ] 对
    - [ ] 错

5. 变量名可以是 Python 中的关键字。
    - [ ] 对
    - [ ] 错

6. `None` 是 Python 中的特殊类型，表示没有值或空值。
    - [ ] 对
    - [ ] 错

7. 在 Python 中，以下哪个是有效的变量赋值？
    - [ ] 123abc = "hello"
    - [ ] for = "world"
    - [ ] _hidden = "secret"
    - [ ] import = 123

8. 在 Python 中，一个变量可以同时被赋予多个值。
    - [ ] 对
    - [ ] 错

9. 在 Python 中，以下哪个是多变量赋值？
    - [ ] a, b, c = 1, 2, 3
    - [ ] a = 1, b = 2, c = 3
    - [ ] a; b; c = 1; 2; 3
    - [ ] a = 1; b = 2; c = 3;

10. 变量在使用之前必须被赋值。
    - [ ] 对
    - [ ] 错

11. Python 中变量的类型是静态的，一旦赋值就不能改变。
    - [ ] 对
    - [ ] 错

12. 在 Python 中，以下哪个表示全局变量？
    - [ ] var = "hello"
    - [ ] global var
    - [ ] var(global)
    - [ ] def var():

13. 以下哪个表示删除变量？
    - [ ] delete x
    - [ ] del x
    - [ ] remove x
    - [ ] destroy x

14. `x = 5` 之后 `y = x`，现在改变 `y` 的值，`x` 的值也会改变。
    - [ ] 对
    - [ ] 错

15. `x = [1, 2, 3]` 之后 `y = x`，现在改变 `y` 的列表内容，`x` 的内容也会改变。
    - [ ] 对
    - [ ] 错

16. 在 Python 中，变量只能存储基本数据类型的值，如整数或字符串。
    - [ ] 对
    - [ ] 错

::: details Answer

1. 在 Python 中，变量名可以以数字开始。
   - [ ] 对
   - [x] 错

2. 在 Python 中，以下哪个变量名是有效的？
   - [ ] 2myVar
   - [x] myVar2
   - [ ] my-var
   - [ ] my var

3. 在 Python 中，变量名区分大小写。
   - [x] 对
   - [ ] 错

4. 在Python中，`my_var` 和 `myVar` 是同一个变量。
   - [ ] 对
   - [x] 错

5. 变量名可以是 Python 中的关键字。
   - [ ] 对
   - [x] 错

6. `None` 是 Python 中的特殊类型，表示没有值或空值。
   - [x] 对
   - [ ] 错

7. 在 Python 中，以下哪个是有效的变量赋值？
   - [ ] 123abc = "hello"
   - [ ] for = "world"
   - [x] _hidden = "secret"
   - [ ] import = 123

8. 在 Python 中，一个变量可以同时被赋予多个值。
   - [ ] 对
   - [x] 错

9. 在 Python 中，以下哪个是多变量赋值？
   - [x] a, b, c = 1, 2, 3
   - [ ] a = 1, b = 2, c = 3
   - [ ] a; b; c = 1; 2; 3
   - [ ] a = 1; b = 2; c = 3;

10. 变量在使用之前必须被赋值。
    - [x] 对
    - [ ] 错

11. Python 中变量的类型是静态的，一旦赋值就不能改变。
    - [ ] 对
    - [x] 错

12. 在 Python 中，以下哪个表示全局变量？
    - [ ] var = "hello"
    - [x] global var
    - [ ] var(global)
    - [ ] def var():

13. 以下哪个表示删除变量？
    - [ ] delete x
    - [x] del x
    - [ ] remove x
    - [ ] destroy x

14. `x = 5` 之后 `y = x`，现在改变 `y` 的值，`x` 的值也会改变。
    - [ ] 对
    - [x] 错

15. `x = [1, 2, 3]` 之后 `y = x`，现在改变 `y` 的列表内容，`x` 的内容也会改变。
    - [x] 对
    - [ ] 错

16. 在 Python 中，变量只能存储基本数据类型的值，如整数或字符串。
    - [ ] 对
    - [x] 错

:::















