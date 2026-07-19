"""Phase 5 parser tests — /app/backend/tests/test_parser.py

Run with:  pytest /app/backend/tests/test_parser.py -v
"""

import pytest
from parser import parse, ParserError


# ---------------------------------------------------------------------------
# Happy path — the 3 mock samples the frontend already validates against.
# ---------------------------------------------------------------------------

FOR_LOOP_SRC = """\
int sum = 0;
for (int i = 1; i <= 3; i++) {
    sum += i;
}
System.out.println(sum);
"""

IF_ELSE_SRC = """\
int score = 72;
if (score >= 60) {
    System.out.println("Pass");
} else {
    System.out.println("Fail");
}
"""

WHILE_SRC = """\
int n = 3;
while (n > 0) {
    System.out.println(n);
    n--;
}
"""


def test_for_loop_sample():
    ast = parse(FOR_LOOP_SRC)
    stmts = ast["statements"]
    assert ast["kind"] == "program"
    assert ast["methods"] == []
    assert [s["kind"] for s in stmts] == ["var_decl", "for", "print"]

    var, for_stmt, print_stmt = stmts
    assert var["name"] == "sum" and var["value"]["value"] == 0 and var["line"] == 1
    assert for_stmt["line"] == 2
    assert for_stmt["init"]["name"] == "i"
    assert for_stmt["condition"]["op"] == "<="
    assert for_stmt["update"]["kind"] == "unary_stmt"
    assert for_stmt["update"]["op"] == "++"

    body = for_stmt["body"]
    assert body[0]["kind"] == "assign" and body[0]["op"] == "+="
    assert body[0]["name"] == "sum" and body[0]["line"] == 3

    assert print_stmt["line"] == 5
    assert print_stmt["value"]["name"] == "sum"


def test_if_else_sample():
    ast = parse(IF_ELSE_SRC)
    stmts = ast["statements"]
    assert [s["kind"] for s in stmts] == ["var_decl", "if"]

    if_stmt = stmts[1]
    assert if_stmt["condition"]["op"] == ">="
    assert if_stmt["then"][0]["value"]["value"] == "Pass"
    assert if_stmt["else"][0]["value"]["value"] == "Fail"
    # 'else' branch prints "Fail" on line 5 (user's original line numbering)
    assert if_stmt["else"][0]["line"] == 5


def test_while_sample():
    ast = parse(WHILE_SRC)
    stmts = ast["statements"]
    assert [s["kind"] for s in stmts] == ["var_decl", "while"]

    while_stmt = stmts[1]
    assert while_stmt["condition"]["op"] == ">"
    assert [s["kind"] for s in while_stmt["body"]] == ["print", "unary_stmt"]
    assert while_stmt["body"][1]["op"] == "--"
    assert while_stmt["body"][1]["line"] == 4


# ---------------------------------------------------------------------------
# Methods
# ---------------------------------------------------------------------------

def test_method_declaration_and_call():
    src = """\
class Main {
  static int add(int a, int b) {
    return a + b;
  }
  public static void main(String[] args) {
    int r = add(2, 3);
    System.out.println(r);
  }
}
"""
    ast = parse(src)
    assert len(ast["methods"]) == 1
    m = ast["methods"][0]
    assert m["name"] == "add"
    assert m["return_type"] == "int"
    assert m["params"] == [{"type": "int", "name": "a"}, {"type": "int", "name": "b"}]
    assert m["body"][0]["kind"] == "return"

    call = ast["statements"][0]["value"]
    assert call["kind"] == "call" and call["name"] == "add"
    assert [a["value"] for a in call["args"]] == [2, 3]


def test_void_method_call_statement():
    src = """\
class Main {
  static void greet() { System.out.println("hi"); }
  public static void main(String[] args) { greet(); }
}
"""
    ast = parse(src)
    assert ast["statements"][0]["kind"] == "method_call"
    assert ast["statements"][0]["name"] == "greet"


# ---------------------------------------------------------------------------
# Assignment operators, unary, boolean, char, double, string
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "src,expected_op",
    [
        ("int x = 1; x += 2;", "+="),
        ("int x = 5; x -= 2;", "-="),
        ("int x = 5; x *= 2;", "*="),
        ("int x = 5; x /= 2;", "/="),
        ("int x = 5; x %= 2;", "%="),
        ("int x = 5; x = 9;", "="),
    ],
)
def test_assignment_operators(src, expected_op):
    ast = parse(src)
    assign = ast["statements"][1]
    assert assign["kind"] == "assign"
    assert assign["op"] == expected_op


def test_prefix_and_postfix_unary():
    ast = parse("int i = 0; i++; ++i;")
    stmts = ast["statements"]
    assert stmts[1]["op"] == "++" and stmts[1]["postfix"] is True
    assert stmts[2]["op"] == "++" and stmts[2]["postfix"] is False


def test_boolean_and_string_and_double_literals():
    ast = parse('boolean b = true; String s = "hi"; double d = 3.14;')
    ss = ast["statements"]
    assert ss[0]["value"]["type"] == "boolean" and ss[0]["value"]["value"] is True
    assert ss[1]["value"]["type"] == "string" and ss[1]["value"]["value"] == "hi"
    assert ss[2]["value"]["type"] == "double" and ss[2]["value"]["value"] == 3.14


# ---------------------------------------------------------------------------
# Rejection / error handling
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "src,fragment",
    [
        ("int[] xs = {1,2,3};", "arrays"),
        ("for (int x : new int[]{1}) {}", "for-each"),
        ("int i = 0; do { i++; } while (i < 3);", "do-while"),
        ("try { int x = 1; } catch (Exception e) {}", "try/catch"),
        ("for (int i=0;i<3;i++) { if (i==1) break; }", "break"),
        ("switch (1) { case 1: break; }", "switch"),
    ],
)
def test_rejects_unsupported(src, fragment):
    with pytest.raises(ParserError) as exc:
        parse(src)
    assert fragment.lower() in str(exc.value).lower()


def test_empty_source():
    with pytest.raises(ParserError):
        parse("")
    with pytest.raises(ParserError):
        parse("   \n  \n  ")


def test_syntax_error_has_line():
    with pytest.raises(ParserError) as exc:
        parse("int a = ;")
    assert exc.value.line == 1


def test_class_wrapper_is_optional():
    """User can provide either a snippet or a fully-wrapped class."""
    wrapped = """\
class Main {
  public static void main(String[] args) {
    int x = 5;
    System.out.println(x);
  }
}
"""
    ast_wrapped = parse(wrapped)
    ast_snippet = parse("int x = 5;\nSystem.out.println(x);")
    # Line numbers must match user's view for the snippet form
    assert ast_snippet["statements"][0]["line"] == 1
    assert ast_snippet["statements"][1]["line"] == 2
    # And they should match the wrapped source's user-facing lines (3, 4)
    assert ast_wrapped["statements"][0]["line"] == 3
    assert ast_wrapped["statements"][1]["line"] == 4
