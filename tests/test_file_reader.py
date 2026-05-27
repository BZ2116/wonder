import pytest
from backend.core.file_reader import read_file, clean_text


def test_read_markdown():
    content = b"# Hello\n\nWorld"
    result = read_file("test.md", content)
    assert "Hello" in result
    assert "World" in result


def test_read_txt_utf8():
    content = "你好世界".encode("utf-8")
    result = read_file("test.txt", content)
    assert "你好世界" in result


def test_read_txt_gbk():
    content = "你好世界".encode("gbk")
    result = read_file("test.txt", content)
    assert "你好世界" in result


def test_clean_text():
    text = "  hello   world  \n\n\n\n\n"
    result = clean_text(text)
    assert result == "hello world"


def test_clean_text_chinese_space():
    text = "hello　world"
    result = clean_text(text)
    assert "　" not in result
