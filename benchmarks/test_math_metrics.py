"""Guard against scoring invalid argument reassociation as recovered math."""
import unittest
from math_benchmark import presentation


class PresentationMetricTests(unittest.TestCase):
    def tree(self, formula):
        return presentation(r'\(' + formula + r'\)')[0]

    def test_equivalent_grouping(self):
        self.assertEqual(self.tree(r'x^{2}+\frac{a+b}{c}'),
                         self.tree(r'{x}^{2}+\frac{{a}+{b}}{{c}}'))

    def test_distinct_fraction_arguments(self):
        self.assertNotEqual(self.tree(r'\frac{x+y}{z}'),
                            self.tree(r'\frac{x}{+yz}'))

    def test_distinct_script_roles(self):
        self.assertNotEqual(self.tree(r'x^{2}'), self.tree(r'x_{2}'))

    def test_no_math_in_prose(self):
        self.assertEqual(presentation('x plus y')[0], [])


if __name__ == '__main__':
    unittest.main()
