#ifndef BUILD_DEBUG
#include <mimalloc.h>
#include <mimalloc-new-delete.h>
#endif

#include <algorithm>
#include <sstream>
#include <cassert>
#include <cstddef>
#include <iostream>
#include <iterator>
#include <limits>
#include <random>
#include <ranges>
#include <stdexcept>
#include <variant>
#include <unordered_map>

using namespace std;

#ifndef BUILD_DEBUG
#include <gtl/phmap.hpp>
#include <gtl/btree.hpp>
#include <gtl/vector.hpp>

template<class T>
using vec = gtl::vector<T, mi_stl_allocator<T>>;
#else
template<class T>
using vec = vector<T>;
#endif

constexpr int cell_flag_shift = 2;
constexpr int cell_flag_msk = (1<<cell_flag_shift)-1;
enum class CellFlag: int {
	None = 0,
	NoMine = 1,
	Decide = 2,
	Mine = 3
};

struct Cell {
	int value;
	Cell(CellFlag flag, int position): value(int(flag)|(position<<cell_flag_shift)) {}
	Cell() {};
	CellFlag flag() const {return CellFlag(value&cell_flag_msk);}
	void operator=(CellFlag x) { value=int(x)|(value&(~cell_flag_msk)); }
	int position() const {return value>>cell_flag_shift;}
	bool operator==(Cell const& other) const { return value==other.value; }
	bool operator<(Cell const& other) const { return value<other.value; }
};

constexpr static string print_cell_numbers[9] = {
	" ", "1", "2", "3", "4", "5", "6", "7", "8"
};

using CellProbs = vec<float>;

template<class F>
void for_neighbors(int i, int j, int h, int w, F f) {
	for (int di=-1; di<=1; di++) {
		for (int dj=-1; dj<=1; dj++) {
			//-_-
			if (di==0 && dj==0) continue;
			int ni=i+di, nj=j+dj;
			if (ni<0 || ni>=h || nj<0 || nj>=w) continue;

			f(ni,nj);
		}
	}
}

bool is_adj(int x, int y, int w) {
	return abs(x/w - y/w)<=1 && abs(x%w - y%w)<=1;
}

constexpr int msk_rpad = 1;
constexpr int msk_lpad = 1;
constexpr int msk_stride = msk_lpad+msk_rpad+3;

int adj_diff(int x, int y, int w) {
	return msk_stride*(x/w - y/w) + (x%w - y%w);
}

int adj_index(int x, int y, int w) {
	int d = msk_lpad + 1 + x%w - y%w;
	if (d<0 || d>=msk_stride) return -1;
	int e = msk_lpad + 1 + x/w - y/w;
	if (e<0 || e>=msk_stride) return -1;
	return msk_stride*e + d;
}

//ughhh
int shift(int a, int b) {return b>0 ? a<<b : a>>(-b);}

struct Solver {
	int h,w,sz;
	int n_mine;

	vec<vec<int>> neighbors;

	constexpr static float impossible = -numeric_limits<float>::infinity();

	//bitmasks by length (0-8), # ones
	array<array<vec<int>, 9>, 9> ways;

	using State = vec<Cell>;

	struct Hasher {
		vec<uint64_t> const& base;
		uint64_t operator()(State const& b) const {
			uint64_t out=0;
			for (Cell c: b) out+=base[c.position()]*uint64_t(c.flag());
			return out;
		}
	};

	struct CheckCell {
		int pos1, pos2, msk1, msk2, count;
	};

	struct CacheResult {
		bool init;
		CellProbs probs;
		int known_i;
	};

	vec<uint64_t> base;
	#ifndef BUILD_DEBUG
	gtl::flat_hash_map<State, unique_ptr<CacheResult>, Hasher, std::equal_to<State>, mi_stl_allocator<pair<State,CacheResult>>> cache;
	#else
	unordered_map<State, unique_ptr<CacheResult>, Hasher> cache;
	#endif

	struct CheckState {
		State s;
		CacheResult* cache_it;

		CheckState(State s): s(s) {}

		int idx=0, count;

		int n_ways=0;
		int mine_offset=0;

		variant<monostate, vec<State>,vec<int>> data;
	};

	vec<int> visited;
	vec<int> tmp_cell_idx;
	vec<int> tmp_cell_msk;
	vec<int> tmp_cell_count;

	vec<int> known;
	vec<int> known_i;
	int cur_known_i=0;

	Solver(int h, int w, int n_mine): h(h), w(w), sz(h*w), n_mine(n_mine),
		neighbors(sz),
		cache(0,Hasher {.base=base}), visited(sz,-1),
		tmp_cell_idx(sz,-1), tmp_cell_msk(sz,-1), tmp_cell_count(sz,-1),
		known(sz,-1), known_i(sz,0) {

		for (int i=0; i<h; i++) {
			for (int j=0; j<w; j++) {
				for_neighbors(i,j,h,w, [&](int ni, int nj) {
					neighbors[i*w + j].push_back(ni*w + nj);
				});
			}
		}

		mt19937_64 rng(123); //i don't care lmao
		for (int i=0; i<sz; i++) base.push_back(rng());

		for (int i=1; i<=8; i++) {
			for (int j=0; j<1<<i; j++) {
				ways[i][__builtin_popcount(j)].push_back(j);
			}
		}
	}

	vec<int> dfs;
	vec<CheckState> cstates;
	int visit_i=-1;

	CellProbs* child_probs;

	void finish(CheckState const& cur) {
		cur.cache_it->init=true;
		child_probs = &cur.cache_it->probs;
		cstates.pop_back();
	};

	bool in_cell(CheckCell const& cell, int x) {
		int adj1 = adj_index(cell.pos1, x, w);
		if (adj1!=-1 && ((1<<adj1)&cell.msk1)) {
			return true;
		}
		
		if (cell.pos2!=-1) {
			int adj2 = adj_index(cell.pos2, x, w);
			if (adj2!=-1 && ((1<<adj2)&cell.msk2)) return true;
		}

		return false;
	}

	template<class F>
	void for_in_cell(F f, CheckCell const& cell) {
		for (int which=0; which<=1; which++) {
			for (int m=which ? cell.msk2 : cell.msk1, i=0; m>0; m>>=1, i++) {
				int shift = __builtin_ctz(m);
				m>>=shift, i+=shift;

				int di=1 + msk_lpad - i/msk_stride;
				int dj=1 + msk_lpad - i%msk_stride;
				f((which ? cell.pos2 : cell.pos1) + w*di + dj);
			}
		}
	}

	bool simple_solve(State& s, int& mine_offset, CheckCell& cell) {
		bool found;
		int min_choice;

		auto push = [this, &min_choice, &cell, &s, &mine_offset, &found](int x, int msk, int count, int x2=-1, int msk2=0) -> bool {
			int k = __builtin_popcount(msk)+__builtin_popcount(msk2);
			if (count<0 || count>k) return true;
			if (k==0 || k>=9) return false;

			CheckCell new_cell {x, x2, msk, msk2, count};

			if (count==0) {
				found=true;
				for_in_cell([this,&s](int y) {
					if (tmp_cell_idx[y]!=-1)
						s[tmp_cell_idx[y]]=CellFlag::NoMine;
				}, new_cell);
			} else if (count==k) {
				found=true;
				for_in_cell([this,&s,&mine_offset](int y) {
					if (tmp_cell_idx[y]!=-1 && s[tmp_cell_idx[y]].flag()==CellFlag::Decide) {
						s[tmp_cell_idx[y]]=CellFlag::Mine, mine_offset++;
					}
				}, new_cell);
			} else if (ways[k][count].size()<min_choice) {
				min_choice=ways[k][count].size();
				cell=new_cell;
			}

			return false;
		};

		while (true) {
			visit_i++;

			dfs.clear();
			for (Cell c: s) {
				for (int y: neighbors[c.position()]) {
					if (known[y]==-1 || visited[y]==visit_i) continue;
					visited[y]=visit_i;

					bool no_unknown = true;

					tmp_cell_msk[y]=0;
					tmp_cell_count[y] = known[y];
					for (int z: neighbors[y]) {
						if (tmp_cell_idx[z]!=-1) {
							Cell a = s[tmp_cell_idx[z]];
							if (a.flag()==CellFlag::Decide) tmp_cell_msk[y]|=1<<adj_index(y,z,w);
							else if (a.flag()==CellFlag::Mine) tmp_cell_count[y]--;
						} else if (known[z]==-1) {
							no_unknown=false;
							break;
						}
					}

					if (no_unknown) {
						// this is kind of covered by below but to merge them id have to push stuff with zero msk, which is weird...
						if (tmp_cell_count[y]>__builtin_popcount(tmp_cell_msk[y]) || tmp_cell_count[y]<0) {
							return false;
						}

						if (tmp_cell_msk[y]) dfs.push_back(y);
					}
				}
			}

			found=false;
			min_choice=INT_MAX;
			cell.pos1=-1;

			for (int x: dfs) {
				int m = tmp_cell_msk[x], nm = ~m;
				if (push(x, m, tmp_cell_count[x])) return false;

				for (int y: neighbors[x]) {
					if (visited[y]!=visit_i || !tmp_cell_msk[y]) continue;

					int shift1 = adj_diff(x, y, w);
					int s1 = shift(tmp_cell_msk[y],shift1), ns1=~s1;
					if ((m&ns1)==0) {
						if (push(x, s1&nm, tmp_cell_count[y] - tmp_cell_count[x])) return false;
					}

					for (int z: neighbors[x]) {
						if (visited[z]!=visit_i || z==y || !tmp_cell_msk[z]) continue;
						int shift2 = adj_diff(x, y, w);
						int s2 = shift(tmp_cell_msk[z],shift2), ns2=~s2;
						if ((m&ns1&ns2)==0 && (nm&s1&s2)==0) {
							if (push(y, shift(s1&nm,-shift1), tmp_cell_count[y] + tmp_cell_count[z] - tmp_cell_count[x], z, shift(s2&(s1|nm),-shift2))) return false;
						}
					}
				}
			}

			if (!found) break;
		}

		return true;
	}

	void print_known_state(State const& s, CheckCell const* cell=nullptr) {
		unordered_map<int,CellFlag> by_pos;
		for (Cell c: s) by_pos.insert({c.position(), c.flag()});

		cout<<"\n";
		for (int i=0; i<h; i++) {
			for (int j=0; j<w; j++) {
				int x = i*w+j;
				if (cell && x==cell->pos1) cout<<"U";
				else if (cell && x==cell->pos2) cout<<"V";
				else if (cell && in_cell(*cell, x)) cout<<"?";
				else if (by_pos[x]==CellFlag::Mine) cout<<"+";
				else if (by_pos[x]==CellFlag::Decide) cout<<"=";
				else if (by_pos[x]==CellFlag::NoMine) cout<<"X";
				else cout<<(known[x]==-1 ? "#" : print_cell_numbers[known[x]]);
				cout<<" \n"[j==w-1];
			}
		}
	}

	constexpr static bool dbg=false;
	CellProbs check(State initial_state) {
		if (dbg) cache.clear();
		cstates.push_back(CheckState(initial_state));

		while (cstates.size()) {
			CheckState& cur = cstates.back();
			
			if (cur.data.index()==0) {
				if (dbg) {
					cout<<"-------------- new state\n";
					print_known_state(cur.s);
				}

				auto res = cache.find(cur.s);

				if (res!=cache.end()) {
					assert(res->second->init);

					int max_known_i=0;
					for (Cell& x: cur.s)
						max_known_i=max(max_known_i, known_i[x.position()]);

					if (max_known_i <= res->second->known_i) {
						child_probs=&res->second->probs;
						cstates.pop_back();
						if (dbg) cout<<"found in cache\n";
						continue;
					}
				}

				cur.cache_it=cache.insert_or_assign(cur.s, make_unique<CacheResult>(CacheResult {
					.init=false, .known_i=cur_known_i
				})).first->second.get();
				auto& ret = cur.cache_it->probs;

				for (int ci=0; ci<cur.s.size(); ci++)
					tmp_cell_idx[cur.s[ci].position()]=ci;

				CheckCell cell;
				bool good = simple_solve(cur.s, cur.mine_offset, cell);
				if (cur.mine_offset>n_mine) good=false;

				if (!good || cell.pos1==-1) {
					if (dbg) cout<<"it's "<<(good ? "good" : "bad")<<", returning\n";

					for (Cell c: cur.s) tmp_cell_idx[c.position()]=-1;

					if (good) {
						ret.resize(cur.mine_offset+1, impossible);
						ret.back()=1.0;
					}

					finish(cur);
					continue;
				}

				int fst_visit_i=visit_i;
				auto& data = cur.data.emplace<vec<State>>();

				dfs.clear();
				for (int ci=0; ci<cur.s.size(); ci++) {
					Cell c = cur.s[ci];
					if (c.flag()!=CellFlag::Decide || visited[c.position()]>fst_visit_i) continue;
					auto& part = data.emplace_back(1,c);

					dfs.push_back(c.position());
					visited[c.position()]=++visit_i;

					while (dfs.size()) {
						int x = dfs.back();
						dfs.pop_back();

						for (int y: neighbors[x]) {
							if (visited[y]!=visit_i) {
								if (tmp_cell_idx[y]!=-1) {
									Cell a = cur.s[tmp_cell_idx[y]];
									part.push_back(a);
									if (a.flag()==CellFlag::Decide) dfs.push_back(y);

									visited[y]=visit_i;
								} else if (known[x]==-1 && known[y]!=-1) {
									dfs.push_back(y);

									visited[y]=visit_i;
								}
							}
						}
					}
				}

				for (Cell c: cur.s) tmp_cell_idx[c.position()]=-1;

				if (data.size()>1) {
					if (dbg) {
						cout<<"disconnecting into "<<data.size()<<" parts\n";
						int pi=0;
						for (auto p: data) {
							cout<<"part "<<++pi<<":\n";
							print_known_state(p);
						}
					}

					ret.resize(cur.mine_offset+1);
					ret.back()=1.0;

					cstates.emplace_back(std::move(data.back()));
					get<vec<State>>(cstates[cstates.size()-2].data).pop_back();
					continue;
				}

				auto& choose_idx = cur.data.emplace<vec<int>>();
				cur.count=cell.count;
				for (int ci=0; ci<cur.s.size(); ci++) {
					int x = cur.s[ci].position();
					if (in_cell(cell, x)) {
						choose_idx.push_back(ci);
					}
				}
		
				if (dbg) {
					cout<<"set of size "<<choose_idx.size()<<" choose "<<cur.count<<" mines\n";
					cout<<"adjacent to "<<((cell.pos1!=-1) + (cell.pos2!=-1))<<" knowns:\n";
					print_known_state(cur.s, &cell);
				}
			} else if (cur.data.index()==1) {
				auto& data = get<vec<State>>(cur.data);
				auto& ret = cur.cache_it->probs;

				bool bad=true;

				vec<float> out(min(int(child_probs->size() + ret.size()) - 1, n_mine+1), impossible);
				for (int i=0; i<out.size(); i++) {
					for (int j=max(0, i-int(child_probs->size())+1); j<=min(i, int(ret.size())-1); j++) {
						if (isinf(ret[j]) || isinf(child_probs->at(i - j)))
							continue;

						float nv = ret[j] * child_probs->at(i - j);
						if (isinf(out[i])) out[i]=nv; else out[i]+=nv;
						bad=false;
					}
				}

				ret=std::move(out);
				if (data.empty() || bad) {
					finish(cur);
				} else {
					auto& child = data.back();
					cstates.emplace_back(std::move(child));

					data.pop_back();
				}
			} else {
				auto const& data = get<vec<int>>(cur.data);
				auto& ret = cur.cache_it->probs;

				if (cur.idx>0) {
					cur.n_ways++;

					int n_mine_add = cur.mine_offset + cur.count;
					int max_n_mine = min(n_mine, n_mine_add + int(child_probs->size()) - 1);
					if (ret.size()<=max_n_mine) ret.resize(max_n_mine+1, impossible);

					for (int i=n_mine_add; i<=max_n_mine; i++) {
						float nv = child_probs->at(i-n_mine_add);
						if (isinf(nv)) continue;

						if (isinf(ret[i])) ret[i]=nv;
						else ret[i]+=nv;
					}
				}

				auto const& ways_ref = ways[data.size()][cur.count];
				if (cur.idx==ways_ref.size()) {
					if (cur.n_ways>0) {
						for (float& x: ret) x/=float(cur.n_ways);
					}

					finish(cur);
					continue;
				}

				int msk = ways_ref[cur.idx++];
				State next = cur.s;
				for (int j=0; j<data.size(); j++) {
					next[data[j]]=(msk&(1<<j)) ? CellFlag::Mine : CellFlag::NoMine;
				}

				cstates.emplace_back(next);
			}
		}

		return *child_probs;
	}

	enum class Failure {
		MustGuess, Solved, Empty, Unsolvable
	};

	vec<Cell> state;
	int n_empty, n_outside;
	int outside_perimeter;
		
	void set_known(vec<int> const& new_known) {
		cur_known_i++;

		for (int i=0; i<sz; i++) {
			if (known[i]!=new_known[i]) {
				known_i[i]=cur_known_i;
				for (int y: neighbors[i]) known_i[y]=cur_known_i;

				known[i]=new_known[i];
			}
		}

		state.clear();

		n_empty=n_outside=0;
		outside_perimeter=-1;

		visit_i=0;
		visited.assign(sz, -1);

		for (int i=0; i<sz; i++) {
			if (known[i]==-1) n_empty++;
			if (visited[i]==visit_i || known[i]==-1) continue;

			dfs.clear();
			dfs.push_back(i);
			visited[i]=visit_i;

			while (dfs.size()) {
				int x = dfs.back(); dfs.pop_back();
				for (int y: neighbors[x]) {
					if (visited[y]!=visit_i) {
						if (known[y]!=-1) dfs.push_back(y);
						else state.push_back(Cell(CellFlag::Decide, y));

						visited[y]=visit_i;
					}
				}
			}
		}

		for (int i=0; i<sz; i++) {
			if (known[i]==-1 && visited[i]!=visit_i) {
				outside_perimeter=i, n_outside++;
			}
		}
	}

	bool can_be_mine(int pos) {
		Cell* x = nullptr;
		for (Cell& c: state) {
			if (c.position()==pos) {x=&c; break;}
		}

		bool ret=false;
		if (x) (*x)=CellFlag::Mine;

		auto probs = check(state);
		for (int i=max(0, n_mine - n_outside - (x!=nullptr)); i<probs.size() && i<n_mine; i++) {
			if (!isinf(probs[i])) {ret=true; break;}
		}

		if (x) (*x)=CellFlag::Decide;

		return ret;
	}

	variant<Failure, array<int,2>> solve() {
		set_known(known);

		if (n_empty==sz) return Failure::Empty;
		if (n_mine>=n_empty || state.empty()) return Failure::Solved;

		int min_on_perimeter = max(0, n_mine - n_outside);

		auto on_perimeter = check(state);
		bool possible=false;
		for (int i=min_on_perimeter; i<n_mine && i<on_perimeter.size(); i++) {
			if (!isinf(on_perimeter[i])) {
				possible=true; break;
			}
		}

		if (!possible && (on_perimeter.size()<=n_mine || isinf(on_perimeter[n_mine])))
			return Failure::Unsolvable;

		int out=-1;
		if (!possible && outside_perimeter!=-1) {
			out=outside_perimeter;
		} else for (int i=0; i<state.size(); i++) {
			state[i]=CellFlag::Mine;

			auto res = check(state);

			possible=false;
			for (int j=max(0,min_on_perimeter-1); j<=min(int(res.size())-1, n_mine-1); j++) {
				if (!isinf(res[j])) {possible=true; break;}
			}

			if (!possible) {
				out=state[i].position();
				// cout<<perimeter[i]/w<<", "<<perimeter[i]%w<<" clear\n";
				break;
			}

			state[i]=CellFlag::Decide;
		}

		if (out==-1) return Failure::MustGuess;
		return array<int,2>{out/w, out%w};
	}
};

struct Generator {
	int w,h,n_mine;
	vec<bool> g;

	array<vec<int>,6> class_pos;

	mt19937_64 rng;

	vec<int> flip;

	bool shift(int k, array<int,4> bbox) {
		for (int i=0; i<6; i++) class_pos[i].clear();

		for (int r=bbox[0]; r<=bbox[1]; r++) {
			for (int c=bbox[2]; c<=bbox[3]; c++) {
				int i = r*w+c;
				if (known[i]!=-1) {
					if (!is_adj(i, start, w)) class_pos[0].push_back(i);
					continue;
				}

				bool perim=false;
				for_neighbors(i/w, i%w, h, w, [&](int ni, int nj) {
					if (known[ni*w+nj]!=-1) perim=true;
				});

				class_pos[2*(1+perim) + g[i]].push_back(i);
			}
		}

		bool r=false;
		auto exchange = [&](int a, int b) {
			if (uniform_int_distribution<>(0,1)(rng)) a++; else b++;

			if (class_pos[a].size() && class_pos[b].size()) {
				int i = uniform_int_distribution<>(0,class_pos[a].size()-1)(rng);
				int j = uniform_int_distribution<>(0,class_pos[b].size()-1)(rng);
				for (int x: {class_pos[a][i], class_pos[b][j]}) {
					g[x]=!g[x];
				}
				swap(class_pos[a][i], class_pos[b][j]);
				r=true;
			}
		};

		while (k--) {
			int v = uniform_int_distribution<>(0,20)(rng);
			if (v<3) {
				exchange(0,2);
			} else if (v<6) {
				exchange(0,4);
			} if (v<12) {
				exchange(2,2);
			} else {
				exchange(2,4);
			}
		}

		return r;
	}

	vec<int> known;
	int reveal(int i, int j) {
		if (g[i*w+j]) throw runtime_error("its a mine oh fuck");
		if (known[i*w+j]!=-1) throw runtime_error("already known");

		int out=1;

		vec<array<int,2>> dfs = {{i,j}};
		while (dfs.size()) {
			auto [u,v] = dfs.back(); dfs.pop_back();

			int& n_adj_mine=known[u*w+v]=0;
			for_neighbors(u,v,h,w, [&](int ni, int nj) {
				if (g[ni*w+nj]) n_adj_mine++;
			});

			if (n_adj_mine==0) for_neighbors(u,v,h,w, [&](int ni, int nj) {
				if (known[ni*w+nj]==-1) {
					dfs.push_back({ni,nj});
					known[ni*w+nj]=0;
					out++;
				}
			});
		}

		return out;
	}

	void gen_initial() {
		int rem_mine = n_mine;

		int left=0;
		for (int x=0; x<h*w; x++) if (!is_adj(x,start,w)) left++;

		for (int x=0; x<h*w; x++) {
			if (is_adj(x,start,w)) continue;
			g[x]=uniform_real_distribution<>()(rng)<float(rem_mine)/(left--);
			if (g[x]) rem_mine--;
		}
	}

	int start_i,start_j,start;
	Generator(int w, int h, int start_i, int start_j, int n_mine, int seed):
		w(w), h(h), n_mine(n_mine), g(h*w), rng(seed), start_i(start_i), start_j(start_j), start(start_i*w + start_j) {
		gen_initial();
	}

	void print_mine_pos(ostream& os) {
		for (int i=0; i<h; i++) {
			for (int j=0; j<w; j++) {
				int x = i*w+j;
				if (g[x]) os<<i<<","<<j<<endl;
			}
		}
	}

	void print(ostream& os) {
		for (int i=0; i<h; i++) {
			for (int j=0; j<w; j++) {
				int x = i*w+j;
				if (g[x]) os<<"!";
				else os<<(known[x]==-1 ? "#" : print_cell_numbers[known[x]]);
				os<<" \n"[j==w-1];
			}
		}
	}

	bool generate() {
		Solver s(h,w,n_mine);
		vec<array<int,2>> move_stack;

		int ntry=0;
		int size = min({h,w,5});
		for (int iter=0; iter<1000; iter++) {
			int r1=uniform_int_distribution<>(0,h-size)(rng), r2=r1+size-1;
			int c1=uniform_int_distribution<>(0,w-size)(rng), c2=c1+size-1;

			vector<int> to_check_bbox;

			known.assign(h*w,-1);
			int n_known=reveal(start_i, start_j);
			for (int i=0; i<move_stack.size(); i++) {
				if (known[move_stack[i][0]*w+move_stack[i][1]]==-1) {
					n_known+=reveal(move_stack[i][0],move_stack[i][1]);
				}
			}

			if (n_known==h*w-n_mine) return true;
			s.set_known(known);

			for (Cell c: s.state) {
				if (g[c.position()]) continue;
				int i = c.position()/w, j=c.position()%w;
				if (i>=r1 && i<=r2 && j>=c1 && j<=c2) {
					to_check_bbox.push_back(c.position());
				}
			}

			auto old_g = g;
			if (to_check_bbox.empty()) {
				if (!shift(1, {0,h-1,0,w-1})) continue;
			} else {
				for (int ti=0; ti<25; ti++) {
					if (!shift(2, {r1,r2,c1,c2})) continue;

					known.assign(h*w,-1);
					reveal(start_i,start_j);
					bool cont=false;
					for (int i=0; i<move_stack.size(); i++) {
						if (g[move_stack[i][0]*w+move_stack[i][1]]) {cont=true; break;}
						if (known[move_stack[i][0]*w+move_stack[i][1]]==-1) {
							reveal(move_stack[i][0],move_stack[i][1]);
						}
					}

					if (cont) continue;
					s.set_known(known);

					bool ex=false;
					for (int x: to_check_bbox) {
						if (!s.can_be_mine(x)) {ex=true; break;}
					}

					if (ex) break;
				}
			}

			known.assign(h*w,-1);
			n_known = reveal(start_i, start_j);

			bool bad=false;
			for (int i=0; i<move_stack.size(); i++) {
				int x = move_stack[i][0]*w+move_stack[i][1];
				if (known[x]!=-1) continue;

				if (g[x]) {
					bad=true; break;
				}

				s.set_known(known);
				if (s.can_be_mine(x)) {
					bad=true; break;
				}
				
				n_known += reveal(move_stack[i][0], move_stack[i][1]);
			}

			if (bad) {
				if (++ntry > 100) {
					ntry=0;
					gen_initial();
					move_stack.clear();
					continue;
				}

				g=old_g;
				continue;
			}

			if (n_known==h*w-n_mine) return true;

			while (true) {
				s.set_known(known);

				bool found=false;
				for (int ci=-1; ci<int(s.state.size()); ci++) {
					if (ci==-1 && s.outside_perimeter==-1) continue;

					int x = ci==-1 ? s.outside_perimeter : s.state[ci].position();
					if (known[x]!=-1 || g[x] || s.can_be_mine(x)) continue;

					found=true;
					move_stack.push_back(array<int,2>{x/w,x%w});
					n_known += reveal(x/w,x%w);

					if (n_known==h*w-n_mine) return true;
					break;
				}

				if (!found) break;
			}
		}

		return false;
	}
};

int main(int argc, char** argv) {
// 	int arr[] = {
//   [0] = -1,
//   [1] = -1,
//   [2] = 2,
//   [3] = 0,
//   [4] = 1,
//   [5] = -1,
//   [6] = -1,
//   [7] = -1,
//   [8] = -1,
//   [9] = -1,
//   [10] = -1,
//   [11] = 3,
//   [12] = 1,
//   [13] = 3,
//   [14] = 3,
//   [15] = -1,
//   [16] = -1,
//   [17] = -1,
//   [18] = -1,
//   [19] = -1,
//   [20] = 2,
//   [21] = -1,
//   [22] = 2,
//   [23] = -1,
//   [24] = 4,
//   [25] = -1,
//   [26] = -1,
//   [27] = -1,
//   [28] = 4,
//   [29] = 2,
//   [30] = 1,
//   [31] = 2,
//   [32] = 1,
//   [33] = 2,
//   [34] = -1,
//   [35] = -1,
//   [36] = -1,
//   [37] = -1,
//   [38] = 3,
//   [39] = 1,
//   [40] = 0,
//   [41] = 0,
//   [42] = 1,
//   [43] = 3,
//   [44] = 3,
//   [45] = -1,
//   [46] = -1,
//   [47] = -1,
//   [48] = 4,
//   [49] = 2,
//   [50] = 1,
//   [51] = 0,
//   [52] = 1,
//   [53] = -1,
//   [54] = -1,
//   [55] = -1,
//   [56] = -1,
//   [57] = -1,
//   [58] = -1,
//   [59] = 4,
//   [60] = 2,
//   [61] = 3,
//   [62] = 2,
//   [63] = -1,
//   [64] = -1,
//   [65] = -1,
//   [66] = -1,
//   [67] = -1,
//   [68] = -1,
//   [69] = -1,
//   [70] = 3,
//   [71] = -1,
//   [72] = -1,
//   [73] = -1,
//   [74] = -1,
//   [75] = -1,
//   [76] = -1,
//   [77] = -1,
//   [78] = -1,
//   [79] = -1,
//   [80] = -1,
// };
	// vec<int> subgrid = {
	// 	0,1,-1,
	// 	1,3,2,
	// 	-1,3,-1,
	// 	-1,-1,-1
	// };
	// Solver solver(4,3,4,subgrid);
	// Solver solver(9,9,35,vec<int>(arr,arr+81));
	// Solver solver(2,3,2,{
	// 	1,2,1,
	// 	-1,-1,-1
	// });
	// Solver solver(2,4,3,{
	// 	 2, 3, 2, 1,
	// 	-1,-1,-1,-1
	// });
	// Solver solver(4,4,8,{
	// 	 0, 0, 2,-1,
	// 	 1, 1, 3,-1,
	// 	-1,-1, 5,-1,
	// 	-1,-1,-1,-1
	// });
	// Solver solver(3,3,3,{
	// 	1,2,2,
	// 	2,-1,-1,
	// 	2,-1,-1
	// });
	// Generator gen(16,16,4,4,99);
	stringstream ss;
	for (int i=1; i<argc; i++) ss<<argv[i]<<"\n";

	int h,w,mines,si,sj;
	ss>>h>>w>>mines>>si>>sj;
	
	if (h*w<=0 || h*w>50*50 || si<0 || sj<0 || si>=h || sj>=w || mines>=h*w-9 || mines<0) {
		cerr<<"received parameters h="<<h<<" w="<<w<<" mines="<<mines<<" si="<<si<<" sj="<<sj<<endl;
		throw runtime_error("invalid parameters");
	}
	
	Generator gen(h,w,si,sj,mines, random_device{}());
	if (!gen.generate()) return 1;
	gen.print_mine_pos(cout);

	// cout<<"\n\nboard done\n\n";

	// auto res = solver.solve();
	// if (Solver::Failure const* failure = get_if<Solver::Failure>(&res)) {
	// 	cout<<"solver failed"<<endl;
	// } else {
	// 	auto pos = get<array<int,2>>(res);
	// 	cout<<pos[0]<<", "<<pos[1]<<" is safe"<<endl;
	// }
	return 0;
}
