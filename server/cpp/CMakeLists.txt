cmake_minimum_required(VERSION 3.22)
project(minesweeper CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS TRUE)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_COLOR_DIAGNOSTICS ON)

add_compile_options(-Wall -Wextra -Wpedantic -Wextra -Wshadow -Wno-sign-compare)
add_link_options(-Wl,-stack_size -Wl,0x20000000)

if (CMAKE_BUILD_TYPE MATCHES Release)
    add_compile_options(-O3 -g)
endif()

if (CMAKE_BUILD_TYPE MATCHES Debug)
    add_compile_definitions(BUILD_DEBUG)
    add_compile_options(-fsanitize=address,undefined)
    add_link_options(-fsanitize=address,undefined)
endif ()

include(FetchContent)
FetchContent_Declare(
    gtl
    GIT_REPOSITORY https://github.com/greg7mdp/gtl.git
    GIT_TAG        v1.2.0
)
FetchContent_MakeAvailable(gtl)

# FetchContent_Declare(
#     cereal
#     GIT_REPOSITORY https://github.com/USCiLab/cereal.git
#     GIT_TAG v1.3.2
#     GIT_SHALLOW TRUE
# )

# set(JUST_INSTALL_CEREAL ON) 

# FetchContent_MakeAvailable(cereal) 

add_executable(wiki wiki.cpp)
target_link_libraries(wiki PUBLIC gtl)

add_executable(main main.cpp)
target_link_libraries(main PUBLIC gtl)

add_executable(tarjan tarjantest.cpp)
target_link_libraries(tarjan PUBLIC gtl)
target_include_directories(tarjan PUBLIC /Users/thomas/Documents/crap)

if (CMAKE_BUILD_TYPE MATCHES Release)
    find_package(mimalloc 2.1 REQUIRED)
    target_link_libraries(main PUBLIC mimalloc)
endif()
