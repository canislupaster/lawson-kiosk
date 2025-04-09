#include "gtl/vector.hpp"
#include "scc.hpp"
#include "testlib.h"

using namespace std;

tarjan t; 

void check(int n, gtl::vector<gtl::vector<int>> const& adj) {
	gtl::vector<int> lowlink(n, -1);
	gtl::vector<int> active;
	gtl::vector<int> comp(n,-1);
	int ncomp=0;

	gtl::vector<tuple<int,int,bool>> stk;
	for (int i=0; i<n; i++) {
		stk.push_back({i, 0, false});
		while (stk.size()) {
			int stk_i = stk.size()-1;
			auto [x, depth, vis] = stk.back();

			if (!vis) {
				if (comp[x]!=-1 || lowlink[x]!=-1) {stk.pop_back(); continue;}
				lowlink[x]=depth;
				active.push_back(x);

				for (int f: adj[x]) {
					stk.push_back({f, depth+1, false});
				}

				get<2>(stk[stk_i])=true;
			} else {
				stk.pop_back();

				for (int f: adj[x]) if (comp[f]==-1) {
					lowlink[x]=min(lowlink[x], lowlink[f]);
				}

				if (depth==lowlink[x]) {
					while (active.back()!=x) {
						comp[active.back()]=ncomp;
						active.pop_back();
					}

					active.pop_back();
					comp[x]=ncomp++;
				}
			}
		}

		if (active.size() || comp[i]==-1) throw runtime_error("fuck");
	}

	cout<<ncomp<<" components"<<endl;

	edge_list<> edges;
	for (int i=0; i<n; i++) {
		for (int y: adj[i]) edges.add_edge(i, y);
	}

	t.solve(edges, n);
	cout<<"tarjan done with "<<t.size<<" components, checking"<<endl;

	vector<int> comp_map(ncomp, -1);
	for (int i=0; i<n; i++) {
		if (comp_map[comp[i]]==-1) comp_map[comp[i]]=t.comp[i];
		else if (comp_map[comp[i]]!=t.comp[i]) {
			cout<<"tarjan: "<<t.comp[i]<<" vs "<<comp_map[comp[i]]<<endl;
			cout<<"graph:"<<endl;
			for (int j=0; j<n; j++) {
				for (int y: adj[j]) {
					cout<<j<<" -> "<<y<<endl;
				}
			}

			throw runtime_error("mismatch");
		}
	}

	cout<<"done"<<endl;
}

int main(int argc, char** argv) {
	registerGen(argc, argv, 1);

	gtl::vector<gtl::vector<int>> adj;
	int n = 10'000;
	for (int t=0; t<1000; t++) {
		// int min_deg = rnd.next(0,5), max_deg = rnd.next(min_deg,10);
		cout<<"test "<<t<<endl;

		adj.resize(n);
		for (int i=0; i<n; i++) {
			auto d = rnd.distinct(rnd.next(0, 100), 0,n-2);
			for (int& x: d) if (x>=i) x++;
			adj[i].assign(d.begin(), d.end());
		}

		check(n, adj);
	}
}
